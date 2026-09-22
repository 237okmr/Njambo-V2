import { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Card,
  GameState,
  PlayedCard,
  Player,
  Trick,
  PartieWinType,
  InstantWinReveal,
  GameSpeed,
  EmoteMessage,
  CutEvent,
  AIDifficulty,
  BetIncreaseProposal,
  SoloBetIncreaseMode,
} from '../types';
import { build31Deck, dealCards, determineTrickWinner, shuffleDeck, isCardPlayable } from '../utils/deck';
import {
  chooseAICard,
  getRandomBotStrategy,
  getRandomBotProfiles,
  evaluateAndShiftBotStrategy,
  shouldBotTriggerKoraAlert,
  shouldBotFoldRound,
  getBotFoldReaction,
  getBotPlayReaction,
  getPlayedCardsInRound,
  isDynamicBossCard,
  ALL_BOT_PROFILES,
  shouldBotAcceptBetIncrease,
  BOT_BET_INCREASE_AGREE_EMOTES,
  BOT_BET_INCREASE_DECLINE_EMOTES,
} from '../utils/ai';
import { sounds, triggerHaptic } from '../utils/sound';
import { getKatikaConfigSync, subscribeKatikaConfig } from '../katika/services/katikaService';
import { KatikaGameConfig } from '../katika/types/katika';
import { computePartieOutcome, applyPartiePayout, detectInstantWin } from '../utils/gameRules';

export const ALL_AI_POOL = ALL_BOT_PROFILES;

export function buildPlayerList(opponentCount: number, initialCapital: number = 100, hokutoSpawnRatePct?: number): Player[] {
  const storedName = typeof window !== 'undefined' ? localStorage.getItem('njambo_player_name') : null;
  const humanPlayer: Player = {
    id: 'p1',
    name: storedName || 'Joueur (Vous)',
    score: initialCapital,
    capital: initialCapital,
    isEliminated: false,
    hand: [],
    isHuman: true,
    avatarSeed: 'humain',
    tricksWonInRound: 0,
  };

  const count = Math.min(3, Math.max(1, opponentCount));
  const effectiveSpawnRate = typeof hokutoSpawnRatePct === 'number' ? hokutoSpawnRatePct : getKatikaConfigSync().hokutoSpawnRatePct;
  const selectedProfiles = getRandomBotProfiles(count, effectiveSpawnRate);

  const selectedAIs = selectedProfiles.map((ai, index) => {
    const isRobam = ai.name === 'Robam Hokuto';
    const personality = isRobam ? 'HOKUTO_ADAPTIVE' : getRandomBotStrategy();
    return {
      id: `p${index + 2}`,
      name: ai.name,
      score: initialCapital,
      capital: initialCapital,
      isEliminated: false,
      hand: [],
      isHuman: false,
      avatarSeed: ai.avatarSeed,
      tricksWonInRound: 0,
      basePersonality: personality,
      aiStrategy: personality,
    };
  });

  return [humanPlayer, ...selectedAIs];
}

interface UseSoloGameEngineProps {
  initialOpponentCount: number;
  initialBaseBet: number;
  initialCap: number;
}

export function useSoloGameEngine({
  initialOpponentCount,
  initialBaseBet,
  initialCap,
}: UseSoloGameEngineProps) {
  const [gameState, setGameState] = useState<GameState>(() => {
    const initialPlayers = buildPlayerList(initialOpponentCount, initialCap);
    const dealerIdx = 0;
    const leadIdx = (dealerIdx + 1) % initialPlayers.length;
    return {
      phase: 'SETUP',
      players: initialPlayers,
      pot: initialBaseBet * initialPlayers.length,
      baseBet: initialBaseBet,
      initialBaseBet: initialBaseBet,
      initialCapital: initialCap,
      enableDoubleKora: true,
      enableUnder21: true,
      aiDifficulty: (localStorage.getItem('njambo_ai_difficulty') as AIDifficulty) || 'NORMAL',
      showBotPersonalityIcons: localStorage.getItem('njambo_show_bot_icons') !== 'false',
      enableKoraHunterAlerts: localStorage.getItem('njambo_enable_kora_alerts') !== 'false',
      soloBetIncreaseMode: (localStorage.getItem('njambo_solo_bet_increase_mode') as 'souverain' | 'tactique' | 'symetrique') || 'souverain',
      betIncreaseProposal: null,
      partieWinType: null,
      consecutiveThreesCountByPlayer: {},
      doubleKoraAchievedByPlayer: {},
      dealerIndex: dealerIdx,
      leadIndex: leadIdx,
      currentTurnIndex: leadIdx,
      currentTrickNumber: 1,
      currentTrick: {
        trickNumber: 1,
        leadSuit: null,
        leadPlayerIndex: leadIdx,
        leadPlayerName: initialPlayers[leadIdx]?.name || 'Joueur',
        plays: [],
        winnerIndex: null,
        winnerName: null,
        winningCard: null,
        isComplete: false,
      },
      tricksHistory: [],
      partieWinnerIndex: null,
      partieWinnerName: null,
      roundWinnerIndex: null,
      roundWinnerName: null,
      mancheWinnerIndex: null,
      mancheWinnerName: null,
      isThinkingAI: false,
      aiThinkingPlayerName: null,
      humanSelectedCardId: null,
      partieCount: 1,
      roundCount: 1,
    };
  });

  const [remainingDeckCount, setRemainingDeckCount] = useState<number>(11);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [katikaConfig, setKatikaConfig] = useState<KatikaGameConfig>(() => getKatikaConfigSync());
  useEffect(() => {
    return subscribeKatikaConfig((cfg) => {
      setKatikaConfig(cfg);
    });
  }, []);
  const [gameSpeed, setGameSpeed] = useState<GameSpeed>(() => {
    const saved = localStorage.getItem('njambo_game_speed');
    return saved === '1.5' ? 1.5 : saved === '2' ? 2 : 1;
  });
  const [ambienceEnabled, setAmbienceEnabled] = useState<boolean>(false);
  const [autoPlaySingleCard, setAutoPlaySingleCard] = useState<boolean>(() => {
    return localStorage.getItem('njambo_auto_play') !== 'false';
  });
  const [activeEmotes, setActiveEmotes] = useState<EmoteMessage[]>([]);
  const [isResolvingTrick, setIsResolvingTrick] = useState<boolean>(false);
  const [isCollectingTrick, setIsCollectingTrick] = useState<boolean>(false);
  const [isDealing, setIsDealing] = useState<boolean>(false);
  const [instantWinReveal, setInstantWinReveal] = useState<InstantWinReveal | null>(null);
  const [showKoraVictoryOverlay, setShowKoraVictoryOverlay] = useState<boolean>(false);
  const [isSoloPaused, setIsSoloPaused] = useState<boolean>(false);

  const instantWinTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dealTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dealStepTimersRef = useRef<NodeJS.Timeout[]>([]);
  const aiTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const collectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const trickStep1TimerRef = useRef<NodeJS.Timeout | null>(null);
  const trickStep2TimerRef = useRef<NodeJS.Timeout | null>(null);
  const botVoteTimersRef = useRef<NodeJS.Timeout[]>([]);
  const lastBotEmoteTimeRef = useRef<number>(0);
  const botEmoteCountInRoundRef = useRef<number>(0);
  const hasRolledBetProposalForPartieRef = useRef<boolean>(false);

  const clearAllSoloTimers = useCallback(() => {
    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
    if (dealTimerRef.current) {
      clearTimeout(dealTimerRef.current);
      dealTimerRef.current = null;
    }
    dealStepTimersRef.current.forEach((t) => clearTimeout(t));
    dealStepTimersRef.current = [];
    if (collectTimerRef.current) {
      clearTimeout(collectTimerRef.current);
      collectTimerRef.current = null;
    }
    if (trickStep1TimerRef.current) {
      clearTimeout(trickStep1TimerRef.current);
      trickStep1TimerRef.current = null;
    }
    if (trickStep2TimerRef.current) {
      clearTimeout(trickStep2TimerRef.current);
      trickStep2TimerRef.current = null;
    }
    if (instantWinTimerRef.current) {
      clearTimeout(instantWinTimerRef.current);
      instantWinTimerRef.current = null;
    }
    botVoteTimersRef.current.forEach((t) => clearTimeout(t));
    botVoteTimersRef.current = [];
  }, []);

  // Listen to visibilitychange to freeze game and avoid timer throttling when tab is in background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const current = gameStateRef.current;
        if (
          current.phase === 'PLAYING' ||
          current.phase === 'DEALING' ||
          isDealing ||
          isResolvingTrick ||
          isCollectingTrick ||
          instantWinReveal !== null
        ) {
          setIsSoloPaused(true);
          clearAllSoloTimers();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clearAllSoloTimers, isDealing, isResolvingTrick, isCollectingTrick, instantWinReveal]);

  const resumeSoloGame = useCallback(() => {
    setIsSoloPaused(false);
    // Trigger state refresh to re-evaluate active turns on active screen
    setGameState((prev) => ({ ...prev }));
  }, []);

  // Sync ref with latest gameState to avoid stale closure issues in async callbacks
  const gameStateRef = useRef<GameState>(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const gameSpeedRef = useRef<GameSpeed>(gameSpeed);
  useEffect(() => {
    gameSpeedRef.current = gameSpeed;
  }, [gameSpeed]);

  const katikaConfigRef = useRef<KatikaGameConfig>(katikaConfig);
  useEffect(() => {
    katikaConfigRef.current = katikaConfig;
  }, [katikaConfig]);

  // Speed multiplier helper for timeouts
  const getDelay = useCallback((baseMs: number) => {
    return Math.round(baseMs / gameSpeedRef.current);
  }, []);

  const toggleGameSpeed = useCallback(() => {
    setGameSpeed((prev) => {
      const next: GameSpeed = prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1;
      localStorage.setItem('njambo_game_speed', String(next));
      return next;
    });
  }, []);

  const toggleAmbience = useCallback(() => {
    setAmbienceEnabled((prev) => {
      const next = !prev;
      sounds.setAmbience(next);
      return next;
    });
  }, []);

  const toggleAutoPlay = useCallback(() => {
    setAutoPlaySingleCard((prev) => {
      const next = !prev;
      localStorage.setItem('njambo_auto_play', String(next));
      return next;
    });
  }, []);

  const sendEmote = useCallback((text: string, emoji?: string, targetPlayerIndex?: number) => {
    const isHuman = targetPlayerIndex === undefined || targetPlayerIndex === 0;
    const player = isHuman ? gameState.players[0] : gameState.players[targetPlayerIndex];
    if (!player) return;
    if (player.isEliminated || player.isForfeit || player.isFoldedInRound) return;

    sounds.playEmotePop();

    const newEmote: EmoteMessage = {
      id: `emote_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      playerId: player.id,
      playerName: player.name,
      text,
      emoji,
      isBot: !player.isHuman,
      timestamp: Date.now(),
    };

    setActiveEmotes((prev) => [...prev.filter((e) => e.playerId !== player.id), newEmote]);

    const duration = gameSpeed === 2 ? 1400 : gameSpeed === 1.5 ? 1900 : 2800;
    setTimeout(() => {
      setActiveEmotes((prev) => prev.filter((e) => e.id !== newEmote.id));
    }, duration);
  }, [gameState.players, gameSpeed]);

  // Helper to find the next active player index (not eliminated and not folded in current round)
  const getNextActivePlayerIndex = useCallback((currentIdx: number, playersList: Player[]) => {
    let next = (currentIdx + 1) % playersList.length;
    let attempts = 0;
    while ((playersList[next].isEliminated || playersList[next].isFoldedInRound) && attempts < playersList.length) {
      next = (next + 1) % playersList.length;
      attempts++;
    }
    return next;
  }, []);

  // Start a new atomic Partie within the Manche
  const startNewPartie = useCallback(
    (
      dealerIndex: number,
      currentPlayers: Player[],
      partieNumber: number,
      currentBet: number = gameStateRef.current.baseBet,
      currentCap: number = gameStateRef.current.initialCapital,
      enableDoubleKoraOpt: boolean = true,
      enableUnder21Opt: boolean = true,
      showBotIconsOpt: boolean = gameStateRef.current.showBotPersonalityIcons,
      enableKoraHunterAlertsOpt: boolean = gameStateRef.current.enableKoraHunterAlerts,
      aiDifficultyOpt: AIDifficulty = gameStateRef.current.aiDifficulty || 'NORMAL',
      soloBetIncreaseModeOpt?: SoloBetIncreaseMode
    ) => {
      if (instantWinTimerRef.current) clearTimeout(instantWinTimerRef.current);
      if (dealTimerRef.current) clearTimeout(dealTimerRef.current);
      if (collectTimerRef.current) clearTimeout(collectTimerRef.current);
      hasRolledBetProposalForPartieRef.current = false;

      sounds.playShuffle();

      const effectiveMode: SoloBetIncreaseMode =
        soloBetIncreaseModeOpt ??
        gameStateRef.current.soloBetIncreaseMode ??
        (localStorage.getItem('njambo_solo_bet_increase_mode') as SoloBetIncreaseMode) ??
        'souverain';
      localStorage.setItem('njambo_solo_bet_increase_mode', effectiveMode);

      let effectiveBet = currentBet;
      const initialBet = partieNumber === 1 ? currentBet : (gameStateRef.current.initialBaseBet || currentBet);

      const currentKatikaCfg = katikaConfigRef.current;

      // Auto stake escalation (Anti-stagnation) - strictly enabled ONLY in souverain mode
      if (effectiveMode === 'souverain' && currentKatikaCfg.enableAutoBetEscalation !== false && partieNumber > 1) {
        const interval = currentKatikaCfg.autoBetEscalationInterval || 5;
        if ((partieNumber - 1) % interval === 0) {
          const maxMultiplier = currentKatikaCfg.maxAutoBetMultiplier || 4;
          const maxAllowedBet = initialBet * maxMultiplier;
          const ratePct = (currentKatikaCfg.autoBetEscalationRatePct || 50) / 100;
          const increaseStep = Math.max(5, Math.round(currentBet * ratePct));
          const targetBet = currentBet + increaseStep;

          const nonEliminated = currentPlayers.filter((p) => !p.isEliminated);
          const minCap = nonEliminated.length > 0 ? Math.min(...nonEliminated.map((p) => p.capital)) : currentBet;
          const newEscalatedBet = Math.min(targetBet, maxAllowedBet, minCap);

          if (newEscalatedBet > currentBet) {
            effectiveBet = newEscalatedBet;
            sendEmote(`⚡ Escalade automatique ! La mise passe à ${newEscalatedBet} 🪙 (palier donne #${partieNumber}).`, '⚡', -1);
          }
        }
      }

      // Filter & mark players who cannot pay ante as eliminated
      const updatedCapitalPlayers = currentPlayers.map((p) => {
        if (!p.isEliminated && p.capital < effectiveBet) {
          return { ...p, isEliminated: true };
        }
        return p;
      });

      const activePlayers = updatedCapitalPlayers.filter(
        (p) => !p.isEliminated && p.capital >= effectiveBet
      );

      const humanPlayer = updatedCapitalPlayers.find((p) => p.isHuman);
      const isHumanEliminated = !humanPlayer || humanPlayer.isEliminated;

      if (activePlayers.length <= 1 || isHumanEliminated) {
        const survivor = activePlayers[0] || [...updatedCapitalPlayers].sort((a, b) => b.capital - a.capital)[0];
        const survivorIndex = updatedCapitalPlayers.findIndex((p) => p.id === survivor.id);

        setGameState((prev) => ({
          ...prev,
          players: updatedCapitalPlayers,
          phase: 'MANCHE_OVER',
          mancheWinnerIndex: survivorIndex,
          mancheWinnerName: survivor.name,
        }));
        return;
      }

      const updatedPlayers = updatedCapitalPlayers.map((p) => {
        const botStrat = !p.isHuman ? (p.basePersonality || getRandomBotStrategy()) : undefined;
        if (!p.isEliminated && p.capital >= effectiveBet) {
          const newCap = p.capital - effectiveBet;
          return {
            ...p,
            capital: newCap,
            score: newCap,
            tricksWonInRound: 0,
            isFoldedInRound: false,
            basePersonality: botStrat,
            aiStrategy: botStrat,
          };
        }
        return {
          ...p,
          tricksWonInRound: 0,
          isFoldedInRound: false,
          basePersonality: botStrat,
          aiStrategy: botStrat,
        };
      });

      const potForThisPartie = effectiveBet * activePlayers.length;

      const fullDeck = build31Deck();
      const shuffledDeck = shuffleDeck(fullDeck);
      const { hands, remainingDeck } = dealCards(shuffledDeck, activePlayers.length, dealerIndex);
      setRemainingDeckCount(remainingDeck.length);

      let handIndex = 0;
      const playersWithCards = updatedPlayers.map((p) => {
        if (!p.isEliminated && p.capital >= 0) {
          const playerHand = hands[handIndex++] || [];
          return { ...p, hand: playerHand };
        }
        return { ...p, hand: [] };
      });

      let validDealerIdx = dealerIndex;
      while (playersWithCards[validDealerIdx].isEliminated) {
        validDealerIdx = (validDealerIdx + 1) % playersWithCards.length;
      }

      let validLeadIdx = (validDealerIdx + 1) % playersWithCards.length;
      while (playersWithCards[validLeadIdx].isEliminated) {
        validLeadIdx = (validLeadIdx + 1) % playersWithCards.length;
      }

      setIsDealing(true);
      setIsResolvingTrick(false);
      setIsCollectingTrick(false);
      setInstantWinReveal(null);

      setShowKoraVictoryOverlay(false);
      botEmoteCountInRoundRef.current = 0;

      // Clear any existing step timers
      dealStepTimersRef.current.forEach((t) => clearTimeout(t));
      dealStepTimersRef.current = [];

      // Initial empty dealing counts (0 cards dealt)
      const initialDealtCounts: Record<number, number> = {};
      playersWithCards.forEach((_, idx) => {
        initialDealtCounts[idx] = 0;
      });

      setGameState((prev) => ({
        ...prev,
        phase: 'DEALING',
        players: playersWithCards,
        cardsDealtCountByPlayer: initialDealtCounts,
        pot: potForThisPartie,
        baseBet: effectiveBet,
        initialBaseBet: initialBet,
        initialCapital: currentCap,
        enableDoubleKora: enableDoubleKoraOpt,
        enableUnder21: enableUnder21Opt,
        aiDifficulty: aiDifficultyOpt,
        showBotPersonalityIcons: showBotIconsOpt,
        enableKoraHunterAlerts: enableKoraHunterAlertsOpt,
        soloBetIncreaseMode: effectiveMode,
        betIncreaseProposal: null,
        showKoraHunterAlert: false,
        koraHunterAlertShown: false,
        partieWinType: null,
        consecutiveThreesCountByPlayer: {},
        doubleKoraAchievedByPlayer: {},
        dealerIndex: validDealerIdx,
        leadIndex: validLeadIdx,
        currentTurnIndex: validLeadIdx,
        currentTrickNumber: 1,
        currentTrick: {
          trickNumber: 1,
          leadSuit: null,
          leadPlayerIndex: validLeadIdx,
          leadPlayerName: playersWithCards[validLeadIdx].name,
          plays: [],
          winnerIndex: null,
          winnerName: null,
          winningCard: null,
          isComplete: false,
        },
        tricksHistory: [],
        partieWinnerIndex: null,
        partieWinnerName: null,
        mancheWinnerIndex: null,
        mancheWinnerName: null,
        isThinkingAI: false,
        aiThinkingPlayerName: null,
        humanSelectedCardId: null,
        partieCount: partieNumber,
      }));

      // Calculate deal order starting from lead index up to dealer
      const dealOrderIndices: number[] = [];
      let currOrderIdx = validLeadIdx;
      for (let i = 0; i < playersWithCards.length; i++) {
        if (!playersWithCards[currOrderIdx].isEliminated) {
          dealOrderIndices.push(currOrderIdx);
        }
        currOrderIdx = (currOrderIdx + 1) % playersWithCards.length;
      }

      let accumulatedTime = 200; // Pause initiale avant le début de la distribution
      const stepDelay = 480; // 480ms par joueur pour bien voir la carte apparaître

      // 1ère Passe: 3 cartes à chaque joueur
      dealOrderIndices.forEach((pIdx) => {
        const stepTime = accumulatedTime;
        const t = setTimeout(() => {
          sounds.playCardPlay();
          setGameState((prev) => ({
            ...prev,
            cardsDealtCountByPlayer: {
              ...(prev.cardsDealtCountByPlayer || {}),
              [pIdx]: 3,
            },
          }));
        }, getDelay(stepTime));
        dealStepTimersRef.current.push(t);
        accumulatedTime += stepDelay;
      });

      // Pause marquée entre la 1ère passe (3 cartes) et la 2ème passe (2 cartes)
      accumulatedTime += 400;

      // 2ème Passe: 2 cartes à chaque joueur (total 5 cartes)
      dealOrderIndices.forEach((pIdx) => {
        const stepTime = accumulatedTime;
        const t = setTimeout(() => {
          sounds.playCardPlay();
          setGameState((prev) => ({
            ...prev,
            cardsDealtCountByPlayer: {
              ...(prev.cardsDealtCountByPlayer || {}),
              [pIdx]: 5,
            },
          }));
        }, getDelay(stepTime));
        dealStepTimersRef.current.push(t);
        accumulatedTime += stepDelay;
      });

      dealTimerRef.current = setTimeout(() => {
        setIsDealing(false);

        // Check Instant Win (THREE_SEVENS or UNDER_21)
        const instantWin = detectInstantWin({
          hands: playersWithCards.map((p) => p.hand || []),
          eligible: playersWithCards.map((p) => !p.isEliminated),
          dealerIndex: validDealerIdx,
          enableUnder21: enableUnder21Opt,
        });

        if (instantWin) {
          const winnerIdx = instantWin.winnerIndex;
          const winner = playersWithCards[winnerIdx];
          const winType = instantWin.winType;
          const scoreOrCount = winType === 'THREE_SEVENS' ? 3 : winner.hand.reduce((acc, c) => acc + c.value, 0);

          setInstantWinReveal({
            winnerIndex: winnerIdx,
            winnerName: winner.name,
            winType,
            hand: winner.hand,
            scoreOrCount,
          });
          sounds.playCardPlay();

          instantWinTimerRef.current = setTimeout(() => {
            if (winType === 'THREE_SEVENS') {
              sounds.playThreeSevens();
            } else {
              sounds.playUnder21();
            }
            if (winner.isHuman) {
              triggerHaptic('success');
              confetti({ particleCount: winType === 'THREE_SEVENS' ? 140 : 160, spread: 85, origin: { y: 0.55 } });
            }

            const payout = applyPartiePayout({
              capitals: playersWithCards.map((p) => p.capital),
              isEliminated: playersWithCards.map((p) => p.isEliminated),
              winnerIndex: winnerIdx,
              pot: potForThisPartie,
              baseBet: currentBet,
              multiplier: 1,
              rakePct: 0,
            });

            const evaluatedPlayers = playersWithCards.map((p, idx) => ({
              ...p,
              capital: payout.capitals[idx],
              score: payout.capitals[idx],
              isEliminated: payout.eliminated[idx],
            }));

            const remainingActive = evaluatedPlayers.filter((p) => !p.isEliminated);
            const humanIsEliminated = evaluatedPlayers.some((p) => p.isHuman && p.isEliminated);
            const isMancheEnd = remainingActive.length <= 1 || humanIsEliminated;

            const mancheWinnerPlayer = remainingActive[0] || [...evaluatedPlayers].sort((a, b) => b.capital - a.capital)[0];
            const mancheWinnerIdx = evaluatedPlayers.findIndex((p) => p.id === mancheWinnerPlayer.id);

            setInstantWinReveal(null);
            setShowKoraVictoryOverlay(true);
            setGameState((prev) => ({
              ...prev,
              phase: isMancheEnd ? 'MANCHE_OVER' : 'PARTIE_OVER',
              players: evaluatedPlayers,
              pot: potForThisPartie,
              baseBet: currentBet,
              initialCapital: currentCap,
              enableDoubleKora: enableDoubleKoraOpt,
              enableUnder21: enableUnder21Opt,
              partieWinnerIndex: winnerIdx,
              partieWinnerName: winner.name,
              partieWinType: winType,
              mancheWinnerIndex: isMancheEnd ? mancheWinnerIdx : null,
              mancheWinnerName: isMancheEnd ? mancheWinnerPlayer.name : null,
              consecutiveThreesCountByPlayer: {},
              doubleKoraAchievedByPlayer: {},
              partieCount: partieNumber,
            }));
            setIsResolvingTrick(false);
          }, getDelay(katikaConfigRef.current.instantWinAnimationTimeMs || 3500));
          return;
        }

        const playersWithEvaluatedStrats = playersWithCards.map((p) => {
          if (!p.isHuman && !p.isEliminated && p.hand.length > 0) {
            const activeStrat = evaluateAndShiftBotStrategy(p, 1, playersWithCards, []);
            return { ...p, aiStrategy: activeStrat };
          }
          return p;
        });

        const hasKoraHunter = enableKoraHunterAlertsOpt && playersWithEvaluatedStrats.some(
          (p) => shouldBotTriggerKoraAlert(p, p.aiStrategy || 'CONSERVATIVE')
        );

        setGameState((prev) => ({
          ...prev,
          phase: 'PLAYING',
          players: playersWithEvaluatedStrats,
          showKoraHunterAlert: hasKoraHunter,
          koraHunterAlertShown: hasKoraHunter,
        }));
      }, 1200);
    },
    [getDelay, sendEmote]
  );

  // Initialize a fresh Manche with full initial capital
  const startNewManche = useCallback(
    (
      optCount: number = initialOpponentCount,
      betVal: number = initialBaseBet,
      capVal: number = initialCap,
      enableDoubleKoraVal: boolean = true,
      enableUnder21Val: boolean = true,
      showBotIconsVal: boolean = gameState.showBotPersonalityIcons,
      enableKoraHunterAlertsVal: boolean = gameState.enableKoraHunterAlerts,
      aiDifficultyVal: AIDifficulty = gameState.aiDifficulty || 'NORMAL',
      soloBetIncreaseModeVal?: SoloBetIncreaseMode
    ) => {
      const newPlayers = buildPlayerList(optCount, capVal);
      startNewPartie(
        0,
        newPlayers,
        1,
        betVal,
        capVal,
        enableDoubleKoraVal,
        enableUnder21Val,
        showBotIconsVal,
        enableKoraHunterAlertsVal,
        aiDifficultyVal,
        soloBetIncreaseModeVal
      );
    },
    [startNewPartie, initialOpponentCount, initialBaseBet, initialCap, gameState.showBotPersonalityIcons, gameState.enableKoraHunterAlerts, gameState.aiDifficulty]
  );

  // Turn management effect: AI vs Human & Auto-play forced moves
  useEffect(() => {
    if (gameState.phase !== 'PLAYING' || isResolvingTrick || isCollectingTrick || isSoloPaused) {
      return;
    }

    const current = gameStateRef.current;
    const currentPlayer = current.players[current.currentTurnIndex];
    if (!currentPlayer || currentPlayer.isEliminated) {
      const nextActiveIdx = getNextActivePlayerIndex(current.currentTurnIndex, current.players);
      setGameState((prev) => ({ ...prev, currentTurnIndex: nextActiveIdx }));
      return;
    }

    if (!currentPlayer.isHuman) {
      setGameState((prev) => {
        if (prev.isThinkingAI && prev.aiThinkingPlayerName === currentPlayer.name) {
          return prev;
        }
        return {
          ...prev,
          isThinkingAI: true,
          aiThinkingPlayerName: currentPlayer.name,
        };
      });

      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);

      const targetTurnIdx = current.currentTurnIndex;
      aiTimerRef.current = setTimeout(() => {
        handlePlayCard(targetTurnIdx);
      }, getDelay(katikaConfig.botThinkTimeMs || 800));
    } else {
      setGameState((prev) => {
        if (!prev.isThinkingAI && prev.aiThinkingPlayerName === null) {
          return prev;
        }
        return {
          ...prev,
          isThinkingAI: false,
          aiThinkingPlayerName: null,
        };
      });
      triggerHaptic('turn');

      // Auto-play forced move detection:
      // Only auto-play on the 5th and final trick (when the human player has exactly 1 card left in hand).
      // Give dynamic botThinkTimeMs delay and pre-select the card so the player clearly sees what happens.
      if (autoPlaySingleCard && currentPlayer.hand && currentPlayer.hand.length === 1) {
        const singleCard = currentPlayer.hand[0];
        setGameState((prev) => ({
          ...prev,
          humanSelectedCardId: singleCard.id,
        }));

        if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = setTimeout(() => {
          handlePlayCard(0, singleCard);
        }, getDelay(katikaConfig.botThinkTimeMs || 800));
      }
    }

    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, [
    gameState.phase,
    gameState.currentTurnIndex,
    isResolvingTrick,
    isCollectingTrick,
    isSoloPaused,
    getNextActivePlayerIndex,
    autoPlaySingleCard,
    getDelay,
    katikaConfig.botThinkTimeMs,
  ]);

  const handleFoldRound = useCallback((playerIndex: number = 0) => {
    const current = gameStateRef.current;
    if (current.phase !== 'PLAYING') return;

    const player = current.players[playerIndex];
    if (!player || player.isEliminated || player.isFoldedInRound) return;

    sounds.playCardSweep();
    triggerHaptic('heavy');

    // Mark player as folded in current round, and clear their hand for the round
    // (Any card already played in the current trick stays in currentTrick.plays!)
    const updatedPlayers = current.players.map((p, idx) =>
      idx === playerIndex
        ? { ...p, isFoldedInRound: true, hand: [] }
        : p
    );

    // Remaining non-eliminated and non-folded active players in this round
    const remainingActivePlayers = updatedPlayers.filter((p) => !p.isEliminated && !p.isFoldedInRound);

    // If only 1 active player remains (e.g. 1v1 or all others folded)
    if (remainingActivePlayers.length <= 1) {
      const soleWinner = remainingActivePlayers[0] || updatedPlayers.find((p) => !p.isEliminated) || updatedPlayers[0];
      const winnerIdx = updatedPlayers.findIndex((p) => p.id === soleWinner.id);

      // Après forfaits, le joueur restant gagne le pot en victoire STANDARD (multiplicateur 1)
      const partieWinType: PartieWinType = 'STANDARD';
      const payout = applyPartiePayout({
        capitals: updatedPlayers.map((p) => p.capital),
        isEliminated: updatedPlayers.map((p) => p.isEliminated),
        winnerIndex: winnerIdx,
        pot: current.pot,
        baseBet: current.baseBet,
        multiplier: 1,
        rakePct: 0,
      });

      const evaluatedPlayers = updatedPlayers.map((p, idx) => ({
        ...p,
        capital: payout.capitals[idx],
        score: payout.capitals[idx],
        isEliminated: payout.eliminated[idx],
      }));

      const remainingActive = evaluatedPlayers.filter((p) => !p.isEliminated);

      sounds.playRoundVictory();

      if (soleWinner.isHuman) {
        triggerHaptic('success');
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.6 },
        });
      }

      if (remainingActive.length <= 1) {
        const mancheWinnerPlayer = remainingActive[0] || [...evaluatedPlayers].sort((a, b) => b.capital - a.capital)[0];
        const mancheWinnerIdx = evaluatedPlayers.findIndex((p) => p.id === mancheWinnerPlayer.id);

        setGameState((prev) => ({
          ...prev,
          phase: 'MANCHE_OVER',
          players: evaluatedPlayers,
          pot: 0,
          partieWinnerIndex: winnerIdx,
          partieWinnerName: soleWinner.name,
          partieWinType,
          mancheWinnerIndex: mancheWinnerIdx,
          mancheWinnerName: mancheWinnerPlayer.name,
          humanSelectedCardId: null,
          isThinkingAI: false,
        }));
      } else {
        setGameState((prev) => ({
          ...prev,
          phase: 'PARTIE_OVER',
          players: evaluatedPlayers,
          pot: 0,
          partieWinnerIndex: winnerIdx,
          partieWinnerName: soleWinner.name,
          partieWinType,
          humanSelectedCardId: null,
          isThinkingAI: false,
        }));
      }
      return;
    }

    // If 2 or more players still active in the round (e.g. 3 or 4-player game):
    // Check if the current trick can now resolve (plays count >= active players in trick)
    const activePlayersInTrick = updatedPlayers.filter(
      (p, idx) => !p.isEliminated && (!p.isFoldedInRound || current.currentTrick.plays.some((pl) => pl.playerIndex === idx))
    ).length;

    const isTrickNowComplete = current.currentTrick.plays.length >= activePlayersInTrick && current.currentTrick.plays.length > 0;

    if (isTrickNowComplete) {
      const nextTurnIdx = getNextActivePlayerIndex(playerIndex, updatedPlayers);
      setGameState((prev) => ({
        ...prev,
        players: updatedPlayers,
        currentTurnIndex: nextTurnIdx,
        humanSelectedCardId: null,
      }));
    } else {
      // Advance turn if it was the folded player's turn
      const nextTurnIndex = current.currentTurnIndex === playerIndex
        ? getNextActivePlayerIndex(playerIndex, updatedPlayers)
        : current.currentTurnIndex;

      setGameState((prev) => ({
        ...prev,
        players: updatedPlayers,
        currentTurnIndex: nextTurnIndex,
        humanSelectedCardId: null,
      }));
    }
  }, [getNextActivePlayerIndex]);

  // Play a card
  const handlePlayCard = useCallback(
    (playerIndex: number, specificCard?: Card) => {
      const current = gameStateRef.current;
      if (current.phase !== 'PLAYING') return;

      const player = current.players[playerIndex];
      if (!player || player.isEliminated || !player.hand || player.hand.length === 0) return;

      let cardToPlay: Card;
      let activeStrategyForBot = player.aiStrategy || 'CONSERVATIVE';

      if (player.isHuman) {
        if (!specificCard) return;
        const inHand = player.hand.some((c) => c.id === specificCard.id);
        if (!inHand) return;
        const leadSuit = current.currentTrick.leadSuit;
        if (!isCardPlayable(specificCard, player.hand, leadSuit)) return;
        cardToPlay = specificCard;
      } else {
        const activeCount = current.players.filter((p) => !p.isEliminated && !p.isFoldedInRound).length;

        // Evaluate AI fold on trick 1 with hopeless hands in 3-4 player tables
        if (
          current.currentTrickNumber === 1 &&
          activeCount >= 3 &&
          shouldBotFoldRound(
            player.hand,
            1,
            activeCount,
            player.aiStrategy || 'CONSERVATIVE',
            current.aiDifficulty || 'NORMAL'
          )
        ) {
          const reaction = getBotFoldReaction();
          sendEmote(reaction.text, reaction.emoji, playerIndex);
          handleFoldRound(playerIndex);
          return;
        }

        activeStrategyForBot = evaluateAndShiftBotStrategy(
          player,
          current.currentTrickNumber,
          current.players,
          current.tricksHistory,
          current.currentTrick.plays
        );

        if (
          current.enableKoraHunterAlerts &&
          !current.koraHunterAlertShown &&
          shouldBotTriggerKoraAlert(player, activeStrategyForBot, true)
        ) {
          setGameState((prev) => ({
            ...prev,
            showKoraHunterAlert: true,
            koraHunterAlertShown: true,
          }));
        }

        cardToPlay = chooseAICard(
          player.hand,
          current.currentTrick.leadSuit,
          current.currentTrick.plays,
          current.currentTrickNumber,
          activeStrategyForBot,
          current.tricksHistory,
          activeCount,
          current.aiDifficulty || 'NORMAL',
          current.players,
          playerIndex
        );
      }

      const isLeadPlay = current.currentTrick.plays.length === 0;
      const trickLeadSuit = isLeadPlay ? cardToPlay.suit : current.currentTrick.leadSuit;
      const isCut = !isLeadPlay && trickLeadSuit !== null && cardToPlay.suit !== trickLeadSuit;
      const isMatchingSuit = !isCut;

      const newPlay: PlayedCard = {
        card: cardToPlay,
        playerIndex,
        playerName: player.name,
        playerId: player.id,
        isLeadCard: isLeadPlay,
        isMatchingSuit,
        isWinningSoFar: false,
        playedOrder: current.currentTrick.plays.length + 1,
      };

      const newPlays = [...current.currentTrick.plays, newPlay];
      const { winnerPlay } = determineTrickWinner(newPlays, trickLeadSuit);
      const isWinningSoFar = winnerPlay ? winnerPlay.playerIndex === playerIndex : false;

      const updatedPlays = newPlays.map((p) => ({
        ...p,
        isWinningSoFar: winnerPlay ? p.playerIndex === winnerPlay.playerIndex : false,
      }));

      // Gather cards played publicly to evaluate Dynamic Boss state
      const cardsPlayedSoFar = getPlayedCardsInRound(current.tricksHistory, current.currentTrick.plays);
      const isDynamicBoss = isDynamicBossCard(cardToPlay, cardsPlayedSoFar);

      // Check if this play broke a threatening Kora streak
      let brokeKoraStreak = false;
      if (isWinningSoFar && current.currentTrickNumber >= 2) {
        const requiredTricksWon = current.currentTrickNumber - 1;
        const threateningLeader = current.players.find(
          (p, idx) => idx !== playerIndex && !p.isEliminated && p.tricksWonInRound === requiredTricksWon
        );
        if (threateningLeader) {
          brokeKoraStreak = true;
        }
      }

      // Contextual Audio FX
      if (isCut) {
        sounds.playCutSlash();
      } else if (
        isWinningSoFar &&
        (cardToPlay.value >= 10 || (cardToPlay.suit === 'PIQUE' && cardToPlay.value === 9) || isDynamicBoss)
      ) {
        sounds.playMbapSlap();
      } else if (isLeadPlay && cardToPlay.value >= 9) {
        sounds.playMbapSlap();
      } else {
        sounds.playCardPlay();
      }

      // Contextual In-Game Commentary (Bots only - with shared table cooldown and round frequency cap)
      if (!player.isHuman) {
        const now = Date.now();
        const timeSinceLastBotEmote = now - lastBotEmoteTimeRef.current;
        const cooldownMs = (katikaConfig.botEmoteCooldownSeconds ?? 7) * 1000;
        const isCooldownActive = timeSinceLastBotEmote < cooldownMs;
        const maxPerRound = typeof katikaConfig.botMaxEmotesPerRound === 'number' ? katikaConfig.botMaxEmotesPerRound : 2;
        const isRoundLimitReached = maxPerRound === 0 || botEmoteCountInRoundRef.current >= maxPerRound;

        // Critical moments (breaking a Kora streak or decisive Trick 5) may speak if cooldown is respected and bypass is allowed
        const isBypassAllowed = katikaConfig.botEmoteCriticalBypassLimit !== false;
        const isHighImpactMoment = isBypassAllowed && (brokeKoraStreak || current.currentTrickNumber === 5);
        const canSpeak = maxPerRound > 0 && !isCooldownActive && (!isRoundLimitReached || isHighImpactMoment);

        if (canSpeak) {
          const botReaction = getBotPlayReaction({
            card: cardToPlay,
            isLeadPlay,
            leadSuit: current.currentTrick.leadSuit,
            isWinningSoFar,
            isCut,
            trickNumber: current.currentTrickNumber,
            isDynamicBoss,
            brokeKoraStreak,
            strategy: activeStrategyForBot,
            botName: player.name,
            difficulty: current.aiDifficulty || 'NORMAL',
          });

          if (botReaction) {
            lastBotEmoteTimeRef.current = now;
            botEmoteCountInRoundRef.current += 1;
            setTimeout(() => {
              sendEmote(botReaction.text, botReaction.emoji, playerIndex);
            }, 320);
          }
        }
      }

      const updatedHand = player.hand.filter((c) => c.id !== cardToPlay.id);
      const updatedPlayers = current.players.map((p, idx) =>
        idx === playerIndex
          ? { ...p, hand: updatedHand, aiStrategy: p.isHuman ? undefined : activeStrategyForBot }
          : p
      );

      const activePlayersCount = current.players.filter((p) => !p.isEliminated && !p.isFoldedInRound).length;
      const isTrickComplete = updatedPlays.length === activePlayersCount;

      if (!isTrickComplete) {
        const nextTurnIndex = getNextActivePlayerIndex(playerIndex, updatedPlayers);
        setGameState((prev) => ({
          ...prev,
          players: updatedPlayers,
          currentTurnIndex: nextTurnIndex,
          humanSelectedCardId: null,
          isThinkingAI: false,
          currentTrick: {
            ...prev.currentTrick,
            leadSuit: trickLeadSuit,
            plays: updatedPlays,
          },
        }));
      } else {
        // Trick is complete!
        const finalWinnerPlay = winnerPlay!;
        const trickWinnerIndex = finalWinnerPlay.playerIndex;
        const trickWinnerName = finalWinnerPlay.playerName;
        const isWinningCardThree = finalWinnerPlay.card.value === 3;

        const completedTrick: Trick = {
          trickNumber: current.currentTrickNumber,
          leadSuit: trickLeadSuit,
          leadPlayerIndex: current.currentTrick.leadPlayerIndex,
          leadPlayerName: current.currentTrick.leadPlayerName,
          plays: updatedPlays,
          winnerIndex: trickWinnerIndex,
          winnerName: trickWinnerName,
          winningCard: finalWinnerPlay.card,
          isComplete: true,
        };

        const playersWithTrickScore = updatedPlayers.map((p, idx) =>
          idx === trickWinnerIndex ? { ...p, tricksWonInRound: p.tricksWonInRound + 1 } : p
        );

        const currentConsecutiveMap = current.consecutiveThreesCountByPlayer || {};
        const prevConsecutive3s = currentConsecutiveMap[trickWinnerIndex] || 0;
        const newConsecutive3s = isWinningCardThree ? prevConsecutive3s + 1 : 0;

        const updatedConsecutiveThrees: Record<number, number> = {
          ...currentConsecutiveMap,
          [trickWinnerIndex]: newConsecutive3s,
        };

        Object.keys(updatedConsecutiveThrees).forEach((key) => {
          const pIdx = Number(key);
          if (pIdx !== trickWinnerIndex) {
            updatedConsecutiveThrees[pIdx] = 0;
          }
        });

        const currentDoubleKoraMap = current.doubleKoraAchievedByPlayer || {};
        const updatedDoubleKoraAchieved: Record<number, boolean> = {
          ...currentDoubleKoraMap,
          [trickWinnerIndex]:
            Boolean(currentDoubleKoraMap[trickWinnerIndex]) || (isWinningCardThree && newConsecutive3s >= 2),
        };

        setIsResolvingTrick(true);
        sounds.playTrickWin();
        if (trickWinnerIndex === 0) {
          triggerHaptic('success');
        }

        setGameState((prev) => ({
          ...prev,
          players: playersWithTrickScore,
          consecutiveThreesCountByPlayer: updatedConsecutiveThrees,
          doubleKoraAchievedByPlayer: updatedDoubleKoraAchieved,
          humanSelectedCardId: null,
          isThinkingAI: false,
          currentTrick: completedTrick,
        }));

        // STEP 1: Wait to let players view the winner badge on the trick
        // STEP 2: Trigger sweeping card collection animation towards the winner with chip cascade
        if (trickStep1TimerRef.current) clearTimeout(trickStep1TimerRef.current);
        trickStep1TimerRef.current = setTimeout(() => {
          setIsCollectingTrick(true);
          sounds.playCardSweep();
          sounds.playCoinCascade();

          if (trickStep2TimerRef.current) clearTimeout(trickStep2TimerRef.current);
          trickStep2TimerRef.current = setTimeout(() => {
            setIsCollectingTrick(false);
            const latestState = gameStateRef.current;
            const nextTrickNum = latestState.currentTrickNumber + 1;
            const newHistory = [...latestState.tricksHistory, completedTrick];

            if (nextTrickNum <= 5) {
              setGameState((prev) => ({
                ...prev,
                currentTrickNumber: nextTrickNum,
                leadIndex: trickWinnerIndex,
                currentTurnIndex: trickWinnerIndex,
                tricksHistory: newHistory,
                showKoraHunterAlert: false,
                currentTrick: {
                  trickNumber: nextTrickNum,
                  leadSuit: null,
                  leadPlayerIndex: trickWinnerIndex,
                  leadPlayerName: prev.players[trickWinnerIndex].name,
                  plays: [],
                  winnerIndex: null,
                  winnerName: null,
                  winningCard: null,
                  isComplete: false,
                },
              }));
              setIsResolvingTrick(false);
            } else {
              // Partie finished (5 tricks complete)
              const partieWinnerIdx = trickWinnerIndex;

              const winnerTricksCount = playersWithTrickScore[partieWinnerIdx]?.tricksWonInRound || 0;

              // Check trick 4 in history to ensure 100% robustness against any state desync
              const trick4FromHistory = newHistory[3] || latestState.tricksHistory[3];
              const outcome = computePartieOutcome({
                fifthTrickWinnerIndex: trickWinnerIndex,
                fifthTrickWinningValue: finalWinnerPlay.card.value,
                fourthTrickWinnerIndex: trick4FromHistory?.winnerIndex,
                fourthTrickWinningValue: trick4FromHistory?.winningCard?.value,
                enableDoubleKora: latestState.enableDoubleKora,
              });

              const partieWinType: PartieWinType = outcome.winType;
              const multiplier = outcome.multiplier;

              const payout = applyPartiePayout({
                capitals: playersWithTrickScore.map((p) => p.capital),
                isEliminated: playersWithTrickScore.map((p) => p.isEliminated),
                winnerIndex: partieWinnerIdx,
                pot: latestState.pot,
                baseBet: latestState.baseBet,
                multiplier,
                rakePct: 0,
              });

              playersWithTrickScore.forEach((p, idx) => {
                if (p.isFoldedInRound && multiplier > 1 && idx !== partieWinnerIdx) {
                  const penaltyPaid = Math.min(p.capital, (multiplier - 1) * latestState.baseBet);
                  sendEmote(
                    `⚖️ Règle officielle : Forfait avec pénalité ${multiplier === 4 ? 'Double Kora (x4)' : 'Kora (x2)'} (${penaltyPaid} 🪙).`,
                    '⚖️',
                    idx
                  );
                }
              });

              const evaluatedPlayers = playersWithTrickScore.map((p, idx) => ({
                ...p,
                capital: payout.capitals[idx],
                score: payout.capitals[idx],
                isEliminated: payout.eliminated[idx],
              }));

              const remainingActive = evaluatedPlayers.filter((p) => !p.isEliminated);

              const winTypeStr = partieWinType as string;
              if (winTypeStr === 'DOUBLE_KORA') {
                sounds.playDoubleKora();
                setShowKoraVictoryOverlay(true);
              } else if (winTypeStr === 'KORA') {
                sounds.playKora();
                setShowKoraVictoryOverlay(true);
              } else if (winTypeStr === 'THREE_SEVENS') {
                sounds.playThreeSevens();
                setShowKoraVictoryOverlay(true);
              } else if (winTypeStr === 'UNDER_21') {
                sounds.playUnder21();
                setShowKoraVictoryOverlay(true);
              } else if (winTypeStr === 'FORFEIT') {
                setShowKoraVictoryOverlay(true);
              } else {
                sounds.playRoundVictory();
              }

              const winner = evaluatedPlayers[partieWinnerIdx];
              const humanIsEliminated = evaluatedPlayers.some((p) => p.isHuman && p.isEliminated);
              const isMancheEnd = remainingActive.length <= 1 || humanIsEliminated;

              if (winner.isHuman) {
                triggerHaptic('success');
                confetti({
                  particleCount: partieWinType === 'DOUBLE_KORA' ? 180 : partieWinType === 'KORA' ? 140 : 100,
                  spread: 80,
                  origin: { y: 0.6 },
                });
              } else if (humanIsEliminated) {
                sounds.playRoundDefeat();
                triggerHaptic('heavy');
              }

              if (isMancheEnd) {
                const mancheWinnerPlayer = remainingActive[0] || [...evaluatedPlayers].sort((a, b) => b.capital - a.capital)[0];
                const mancheWinnerIdx = evaluatedPlayers.findIndex((p) => p.id === mancheWinnerPlayer.id);

                setGameState((prev) => ({
                  ...prev,
                  phase: 'MANCHE_OVER',
                  players: evaluatedPlayers,
                  tricksHistory: newHistory,
                  partieWinnerIndex: partieWinnerIdx,
                  partieWinnerName: winner.name,
                  partieWinType: partieWinType,
                  mancheWinnerIndex: mancheWinnerIdx,
                  mancheWinnerName: mancheWinnerPlayer.name,
                }));
              } else {
                setGameState((prev) => ({
                  ...prev,
                  phase: 'PARTIE_OVER',
                  players: evaluatedPlayers,
                  tricksHistory: newHistory,
                  partieWinnerIndex: partieWinnerIdx,
                  partieWinnerName: winner.name,
                  partieWinType: partieWinType,
                }));
              }
              setIsResolvingTrick(false);
            }
          }, getDelay(450));
        }, getDelay(katikaConfig.trickResolutionTimeMs || 1600));
      }
    },
    [
      getNextActivePlayerIndex,
      getDelay,
      sendEmote,
      shouldBotTriggerKoraAlert,
      katikaConfig.trickResolutionTimeMs,
      katikaConfig.globalRakePct,
    ]
  );

  const handleSelectCard = (card: Card) => {
    sounds.playCardSelect();
    setGameState((prev) => ({
      ...prev,
      humanSelectedCardId: card.id,
    }));
  };

  const handleValidateCard = () => {
    if (
      gameState.currentTurnIndex !== 0 ||
      !gameState.humanSelectedCardId ||
      isResolvingTrick ||
      isCollectingTrick
    ) {
      return;
    }

    const human = gameState.players[0];
    const card = human?.hand?.find((c) => c.id === gameState.humanSelectedCardId);
    if (!card) return;

    handlePlayCard(0, card);
  };

  const dismissKoraHunterAlert = useCallback(() => {
    setGameState((prev) => ({ ...prev, showKoraHunterAlert: false }));
  }, []);

  const triggerKoraHunterAlertManually = useCallback(() => {
    const humanPlayer = gameState.players[0];
    if (humanPlayer && (humanPlayer.isEliminated || humanPlayer.isForfeit || humanPlayer.isFoldedInRound)) {
      return;
    }
    setGameState((prev) => ({
      ...prev,
      showKoraHunterAlert: true,
      koraHunterAlertShown: true,
    }));
  }, [gameState.players]);

  const simulateToEnd = useCallback(() => {
    if (instantWinTimerRef.current) clearTimeout(instantWinTimerRef.current);
    if (dealTimerRef.current) clearTimeout(dealTimerRef.current);
    if (collectTimerRef.current) clearTimeout(collectTimerRef.current);
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);

    setIsResolvingTrick(false);
    setIsCollectingTrick(false);
    setIsDealing(false);

    setGameState((current) => {
      let state = { ...current };
      let loops = 0;
      const maxLoops = 1000;

      const getNextActive = (currentIdx: number, playersList: Player[]) => {
        let next = (currentIdx + 1) % playersList.length;
        let attempts = 0;
        while (playersList[next].isEliminated && attempts < playersList.length) {
          next = (next + 1) % playersList.length;
          attempts++;
        }
        return next;
      };

      while (state.phase !== 'MANCHE_OVER' && loops < maxLoops) {
        loops++;

        if (state.phase === 'DEALING') {
          const currentBet = state.baseBet;
          const currentCap = state.initialCapital;
          const playersWithCards = state.players;
          const potForThisPartie = state.pot;
          const partieNumber = state.partieCount;

          let threeSevensWinnerIdx: number | null = null;
          playersWithCards.forEach((player, pIdx) => {
            if (!player.isEliminated && player.hand.length > 0) {
              const sevensCount = player.hand.filter((card) => card.value === 7).length;
              if (sevensCount >= 3) {
                threeSevensWinnerIdx = pIdx;
              }
            }
          });

          if (threeSevensWinnerIdx !== null) {
            const winner = playersWithCards[threeSevensWinnerIdx];
            const playersAfterPot = playersWithCards.map((p, idx) =>
              idx === threeSevensWinnerIdx
                ? { ...p, capital: p.capital + potForThisPartie, score: p.capital + potForThisPartie }
                : p
            );

            const evaluatedPlayers = playersAfterPot.map((p) => ({
              ...p,
              isEliminated: p.isEliminated || p.capital < currentBet,
              score: p.capital,
            }));

            const remainingActive = evaluatedPlayers.filter((p) => !p.isEliminated);
            state = {
              ...state,
              phase: remainingActive.length <= 1 ? 'MANCHE_OVER' : 'PARTIE_OVER',
              players: evaluatedPlayers,
              pot: potForThisPartie,
              partieWinnerIndex: threeSevensWinnerIdx,
              partieWinnerName: winner.name,
              partieWinType: 'THREE_SEVENS',
              mancheWinnerIndex: remainingActive.length <= 1 ? evaluatedPlayers.findIndex((p) => p.id === (remainingActive[0] || winner).id) : null,
              mancheWinnerName: remainingActive.length <= 1 ? (remainingActive[0] || winner).name : null,
              consecutiveThreesCountByPlayer: {},
              doubleKoraAchievedByPlayer: {},
              partieCount: partieNumber,
            };
            continue;
          }

            if (state.enableUnder21) {
              let lowestSum = 999;
              let lowestOrderDistance = 999;
              let under21WinnerIdx: number | null = null;
              const numPlayers = playersWithCards.length;
              const simLeadIdx = state.leadIndex ?? 0;

              playersWithCards.forEach((player, pIdx) => {
                if (!player.isEliminated && player.hand.length > 0) {
                  const sum = player.hand.reduce((acc, card) => acc + card.value, 0);
                  const orderDistance = (pIdx - simLeadIdx + numPlayers) % numPlayers;
                  if (sum <= 21) {
                    if (
                      sum < lowestSum ||
                      (sum === lowestSum && orderDistance < lowestOrderDistance)
                    ) {
                      lowestSum = sum;
                      lowestOrderDistance = orderDistance;
                      under21WinnerIdx = pIdx;
                    }
                  }
                }
              });

            if (under21WinnerIdx !== null) {
              const winner = playersWithCards[under21WinnerIdx];
              const playersAfterPot = playersWithCards.map((p, idx) =>
                idx === under21WinnerIdx
                  ? { ...p, capital: p.capital + potForThisPartie, score: p.capital + potForThisPartie }
                  : p
              );

              const evaluatedPlayers = playersAfterPot.map((p) => ({
                ...p,
                isEliminated: p.isEliminated || p.capital < currentBet,
                score: p.capital,
              }));

              const remainingActive = evaluatedPlayers.filter((p) => !p.isEliminated);
              state = {
                ...state,
                phase: remainingActive.length <= 1 ? 'MANCHE_OVER' : 'PARTIE_OVER',
                players: evaluatedPlayers,
                pot: potForThisPartie,
                partieWinnerIndex: under21WinnerIdx,
                partieWinnerName: winner.name,
                partieWinType: 'UNDER_21',
                mancheWinnerIndex: remainingActive.length <= 1 ? evaluatedPlayers.findIndex((p) => p.id === (remainingActive[0] || winner).id) : null,
                mancheWinnerName: remainingActive.length <= 1 ? (remainingActive[0] || winner).name : null,
                consecutiveThreesCountByPlayer: {},
                doubleKoraAchievedByPlayer: {},
                partieCount: partieNumber,
              };
              continue;
            }
          }

          const playersWithEvaluatedStrats = playersWithCards.map((p) => {
            if (!p.isHuman && !p.isEliminated && p.hand.length > 0) {
              const activeStrat = evaluateAndShiftBotStrategy(p, 1, playersWithCards, []);
              return { ...p, aiStrategy: activeStrat };
            }
            return p;
          });

          state = {
            ...state,
            phase: 'PLAYING',
            players: playersWithEvaluatedStrats,
          };
          continue;
        }

        if (state.phase === 'PARTIE_OVER') {
          const currentBet = state.baseBet;
          const currentPlayers = state.players;
          const partieNumber = state.partieCount + 1;
          const currentCap = state.initialCapital;

          const activePlayers = currentPlayers.filter(
            (p) => !p.isEliminated && p.capital >= currentBet
          );

          if (activePlayers.length <= 1) {
            const survivor = activePlayers[0] || [...currentPlayers].sort((a, b) => b.capital - a.capital)[0];
            const survivorIndex = currentPlayers.findIndex((p) => p.id === survivor.id);
            state = {
              ...state,
              phase: 'MANCHE_OVER',
              mancheWinnerIndex: survivorIndex,
              mancheWinnerName: survivor.name,
            };
            continue;
          }

          const updatedPlayers = currentPlayers.map((p) => {
            const botStrat = !p.isHuman ? (p.basePersonality || getRandomBotStrategy()) : undefined;
            if (!p.isEliminated && p.capital >= currentBet) {
              const newCap = p.capital - currentBet;
              return {
                ...p,
                capital: newCap,
                score: newCap,
                tricksWonInRound: 0,
                basePersonality: botStrat,
                aiStrategy: botStrat,
              };
            }
            return {
              ...p,
              tricksWonInRound: 0,
              basePersonality: botStrat,
              aiStrategy: botStrat,
            };
          });

          const potForThisPartie = currentBet * activePlayers.length;

          const fullDeck = build31Deck();
          const shuffledDeck = shuffleDeck(fullDeck);
          const { hands } = dealCards(shuffledDeck, activePlayers.length);

          let handIndex = 0;
          const playersWithCards = updatedPlayers.map((p) => {
            if (!p.isEliminated && p.capital >= 0) {
              const playerHand = hands[handIndex++] || [];
              return { ...p, hand: playerHand };
            }
            return { ...p, hand: [] };
          });

          const prevWinnerIdx = state.partieWinnerIndex ?? state.roundWinnerIndex;
          let validDealerIdx = (prevWinnerIdx !== null && prevWinnerIdx !== undefined && !playersWithCards[prevWinnerIdx]?.isEliminated)
            ? prevWinnerIdx
            : (state.dealerIndex + 1) % playersWithCards.length;
          while (playersWithCards[validDealerIdx].isEliminated) {
            validDealerIdx = (validDealerIdx + 1) % playersWithCards.length;
          }

          let validLeadIdx = (validDealerIdx + 1) % playersWithCards.length;
          while (playersWithCards[validLeadIdx].isEliminated) {
            validLeadIdx = (validLeadIdx + 1) % playersWithCards.length;
          }

          state = {
            ...state,
            phase: 'PLAYING',
            players: playersWithCards,
            pot: potForThisPartie,
            dealerIndex: validDealerIdx,
            leadIndex: validLeadIdx,
            currentTurnIndex: validLeadIdx,
            currentTrickNumber: 1,
            currentTrick: {
              trickNumber: 1,
              leadSuit: null,
              leadPlayerIndex: validLeadIdx,
              leadPlayerName: playersWithCards[validLeadIdx].name,
              plays: [],
              winnerIndex: null,
              winnerName: null,
              winningCard: null,
              isComplete: false,
            },
            tricksHistory: [],
            partieWinnerIndex: null,
            partieWinnerName: null,
            mancheWinnerIndex: null,
            mancheWinnerName: null,
            isThinkingAI: false,
            aiThinkingPlayerName: null,
            humanSelectedCardId: null,
            partieCount: partieNumber,
            consecutiveThreesCountByPlayer: {},
            doubleKoraAchievedByPlayer: {},
          };
          continue;
        }

        if (state.phase === 'PLAYING') {
          const playerIdx = state.currentTurnIndex;
          const player = state.players[playerIdx];

          if (!player || player.isEliminated) {
            state = {
              ...state,
              currentTurnIndex: getNextActive(playerIdx, state.players),
            };
            continue;
          }

          let activeStrategyForBot = player.aiStrategy || 'CONSERVATIVE';
          let cardToPlay: Card | undefined;

          if (player.isHuman) {
            cardToPlay = player.hand[0];
          } else {
            activeStrategyForBot = evaluateAndShiftBotStrategy(
              player,
              state.currentTrickNumber,
              state.players,
              state.tricksHistory,
              state.currentTrick.plays
            );
            const activeCount = state.players.filter((p) => !p.isEliminated).length;
            cardToPlay = chooseAICard(
              player.hand,
              state.currentTrick.leadSuit,
              state.currentTrick.plays,
              state.currentTrickNumber,
              activeStrategyForBot,
              state.tricksHistory,
              activeCount,
              state.aiDifficulty || 'NORMAL',
              state.players,
              playerIdx
            );
          }

          if (!cardToPlay) {
            state = {
              ...state,
              currentTurnIndex: getNextActive(playerIdx, state.players),
            };
            continue;
          }

          const isLeadPlay = state.currentTrick.plays.length === 0;
          const trickLeadSuit = isLeadPlay ? cardToPlay.suit : state.currentTrick.leadSuit;
          const isMatchingSuit = trickLeadSuit ? cardToPlay.suit === trickLeadSuit : true;

          const newPlay = {
            card: cardToPlay,
            playerIndex: playerIdx,
            playerName: player.name,
            isLeadCard: isLeadPlay,
            isMatchingSuit,
            isWinningSoFar: false,
            playedOrder: state.currentTrick.plays.length + 1,
          };

          const newPlays = [...state.currentTrick.plays, newPlay];
          const { winnerPlay } = determineTrickWinner(newPlays, trickLeadSuit);
          const updatedPlays = newPlays.map((p) => ({
            ...p,
            isWinningSoFar: winnerPlay ? p.playerIndex === winnerPlay.playerIndex : false,
          }));

          const updatedHand = player.hand.filter((c) => c.id !== cardToPlay.id);
          const updatedPlayers = state.players.map((p, idx) =>
            idx === playerIdx
              ? { ...p, hand: updatedHand, aiStrategy: p.isHuman ? undefined : activeStrategyForBot }
              : p
          );

          const activeCount = state.players.filter((p) => !p.isEliminated).length;
          const isTrickComplete = updatedPlays.length === activeCount;

          if (!isTrickComplete) {
            const nextTurnIdx = getNextActive(playerIdx, updatedPlayers);
            state = {
              ...state,
              players: updatedPlayers,
              currentTurnIndex: nextTurnIdx,
              currentTrick: {
                ...state.currentTrick,
                leadSuit: trickLeadSuit,
                plays: updatedPlays,
              },
            };
          } else {
            const finalWinnerPlay = winnerPlay!;
            const trickWinnerIndex = finalWinnerPlay.playerIndex;
            const isWinningCardThree = finalWinnerPlay.card.value === 3;

            const completedTrick = {
              trickNumber: state.currentTrickNumber,
              leadSuit: trickLeadSuit,
              leadPlayerIndex: state.currentTrick.leadPlayerIndex,
              leadPlayerName: state.currentTrick.leadPlayerName,
              plays: updatedPlays,
              winnerIndex: trickWinnerIndex,
              winnerName: finalWinnerPlay.playerName,
              winningCard: finalWinnerPlay.card,
              isComplete: true,
            };

            const playersWithTrickScore = updatedPlayers.map((p, idx) =>
              idx === trickWinnerIndex ? { ...p, tricksWonInRound: p.tricksWonInRound + 1 } : p
            );

            const currentConsecutiveMap = state.consecutiveThreesCountByPlayer || {};
            const prevConsecutive3s = currentConsecutiveMap[trickWinnerIndex] || 0;
            const newConsecutive3s = isWinningCardThree ? prevConsecutive3s + 1 : 0;

            const updatedConsecutiveThrees = {
              ...currentConsecutiveMap,
              [trickWinnerIndex]: newConsecutive3s,
            };

            Object.keys(updatedConsecutiveThrees).forEach((key) => {
              const pIdx = Number(key);
              if (pIdx !== trickWinnerIndex) {
                updatedConsecutiveThrees[pIdx] = 0;
              }
            });

            const currentDoubleKoraMap = state.doubleKoraAchievedByPlayer || {};
            const updatedDoubleKoraAchieved = {
              ...currentDoubleKoraMap,
              [trickWinnerIndex]:
                Boolean(currentDoubleKoraMap[trickWinnerIndex]) || (isWinningCardThree && newConsecutive3s >= 2),
            };

            const nextTrickNum = state.currentTrickNumber + 1;
            const newHistory = [...state.tricksHistory, completedTrick];

            if (nextTrickNum <= 5) {
              state = {
                ...state,
                players: playersWithTrickScore,
                consecutiveThreesCountByPlayer: updatedConsecutiveThrees,
                doubleKoraAchievedByPlayer: updatedDoubleKoraAchieved,
                currentTrickNumber: nextTrickNum,
                leadIndex: trickWinnerIndex,
                currentTurnIndex: trickWinnerIndex,
                tricksHistory: newHistory,
                currentTrick: {
                  trickNumber: nextTrickNum,
                  leadSuit: null,
                  leadPlayerIndex: trickWinnerIndex,
                  leadPlayerName: playersWithTrickScore[trickWinnerIndex].name,
                  plays: [],
                  winnerIndex: null,
                  winnerName: null,
                  winningCard: null,
                  isComplete: false,
                },
              };
            } else {
              const trick4FromHistory = newHistory[3] || state.tricksHistory[3];
              const outcome = computePartieOutcome({
                fifthTrickWinnerIndex: trickWinnerIndex,
                fifthTrickWinningValue: finalWinnerPlay.card.value,
                fourthTrickWinnerIndex: trick4FromHistory?.winnerIndex,
                fourthTrickWinningValue: trick4FromHistory?.winningCard?.value,
                enableDoubleKora: state.enableDoubleKora,
              });

              const partieWinnerIdx = outcome.winnerIndex;
              const winner = playersWithTrickScore[partieWinnerIdx];
              const partieWinType = outcome.winType;
              const multiplier = outcome.multiplier;

              const payout = applyPartiePayout({
                capitals: playersWithTrickScore.map((p) => p.capital),
                isEliminated: playersWithTrickScore.map((p) => p.isEliminated),
                winnerIndex: partieWinnerIdx,
                pot: state.pot,
                baseBet: state.baseBet,
                multiplier,
                rakePct: 0,
              });

              const evaluatedPlayers = playersWithTrickScore.map((p, idx) => ({
                ...p,
                capital: payout.capitals[idx],
                score: payout.capitals[idx],
                isEliminated: payout.eliminated[idx],
              }));

              const remainingActive = evaluatedPlayers.filter((p) => !p.isEliminated);

              if (remainingActive.length <= 1) {
                const mancheWinnerPlayer = remainingActive[0] || [...evaluatedPlayers].sort((a, b) => b.capital - a.capital)[0];
                const mancheWinnerIdx = evaluatedPlayers.findIndex((p) => p.id === mancheWinnerPlayer.id);

                state = {
                  ...state,
                  phase: 'MANCHE_OVER',
                  players: evaluatedPlayers,
                  tricksHistory: newHistory,
                  partieWinnerIndex: partieWinnerIdx,
                  partieWinnerName: winner.name,
                  partieWinType: partieWinType as PartieWinType,
                  mancheWinnerIndex: mancheWinnerIdx,
                  mancheWinnerName: mancheWinnerPlayer.name,
                };
              } else {
                state = {
                  ...state,
                  phase: 'PARTIE_OVER',
                  players: evaluatedPlayers,
                  tricksHistory: newHistory,
                  partieWinnerIndex: partieWinnerIdx,
                  partieWinnerName: winner.name,
                  partieWinType: partieWinType as PartieWinType,
                };
              }
            }
          }
          continue;
        }

        break;
      }

      return state;
    });
  }, [getNextActivePlayerIndex]);

  const dismissKoraVictoryOverlay = useCallback(() => {
    setShowKoraVictoryOverlay(false);
  }, []);

  const clearBotVoteTimers = useCallback(() => {
    botVoteTimersRef.current.forEach((t) => clearTimeout(t));
    botVoteTimersRef.current = [];
  }, []);

  // Propose a bet increase in solo mode
  const handleProposeBetIncreaseSolo = useCallback((proposedBet: number) => {
    clearBotVoteTimers();
    const mode = gameStateRef.current.soloBetIncreaseMode || 'souverain';
    if (mode === 'souverain') {
      // Direct increase, no voting
      setGameState((prev) => ({
        ...prev,
        baseBet: proposedBet,
        betIncreaseProposal: null,
      }));
      sounds.playCoinCascade();
      return;
    }

    // Voting modes ('tactique' or 'symetrique')
    const humanPlayer = gameStateRef.current.players[0];
    if (!humanPlayer) return;

    const proposalId = `bet_inc_${Date.now()}`;
    const newProposal: BetIncreaseProposal = {
      id: proposalId,
      proposedBet,
      proposerId: humanPlayer.id,
      proposerName: humanPlayer.name,
      agreedPlayerIds: [humanPlayer.id],
      createdAt: Date.now(),
      expiresAt: Date.now() + 15000,
    };

    setGameState((prev) => ({
      ...prev,
      betIncreaseProposal: newProposal,
    }));

    // Find active bots
    const activeBotsWithIndices = gameStateRef.current.players
      .map((p, idx) => ({ player: p, index: idx }))
      .filter(({ player }) => !player.isHuman && !player.isEliminated);

    let hasBeenDeclined = false;

    activeBotsWithIndices.forEach(({ player, index }) => {
      // Delay response randomly to feel human
      const delay = 800 + Math.random() * 1200;
      const t = setTimeout(() => {
        if (hasBeenDeclined) return;

        setGameState((prev) => {
          if (!prev.betIncreaseProposal || prev.betIncreaseProposal.id !== proposalId) {
            return prev;
          }

          const diff = prev.aiDifficulty || 'NORMAL';
          const agree = shouldBotAcceptBetIncrease(proposedBet, player.capital, player.aiStrategy, diff);

          const emotes = agree
            ? BOT_BET_INCREASE_AGREE_EMOTES[Math.floor(Math.random() * BOT_BET_INCREASE_AGREE_EMOTES.length)]
            : BOT_BET_INCREASE_DECLINE_EMOTES[Math.floor(Math.random() * BOT_BET_INCREASE_DECLINE_EMOTES.length)];
          
          sendEmote(emotes, agree ? '👍' : '👎', index);

          if (!agree) {
            hasBeenDeclined = true;
            clearBotVoteTimers();
            return {
              ...prev,
              betIncreaseProposal: null,
            };
          }

          const updatedAgreed = [...prev.betIncreaseProposal.agreedPlayerIds, player.id];
          const activePlayersCount = prev.players.filter(p => !p.isEliminated).length;

          if (updatedAgreed.length >= activePlayersCount) {
            sounds.playRoundVictory();
            triggerHaptic('success');
            clearBotVoteTimers();
            return {
              ...prev,
              baseBet: proposedBet,
              betIncreaseProposal: null,
            };
          }

          return {
            ...prev,
            betIncreaseProposal: {
              ...prev.betIncreaseProposal,
              agreedPlayerIds: updatedAgreed,
            },
          };
        });
      }, getDelay(delay));

      botVoteTimersRef.current.push(t);
    });
  }, [sendEmote, getDelay, clearBotVoteTimers]);

  // Respond to a bot proposal in solo Mode C (Symétrique)
  const handleRespondBetIncreaseSolo = useCallback((agree: boolean) => {
    clearBotVoteTimers();
    setGameState((prev) => {
      if (!prev.betIncreaseProposal) return prev;
      if (agree) {
        sounds.playRoundVictory();
        triggerHaptic('success');
        return {
          ...prev,
          baseBet: prev.betIncreaseProposal.proposedBet,
          betIncreaseProposal: null,
        };
      } else {
        return {
          ...prev,
          betIncreaseProposal: null,
        };
      }
    });
  }, [clearBotVoteTimers]);

  // Cancel an active proposal
  const handleCancelBetIncreaseSolo = useCallback(() => {
    clearBotVoteTimers();
    setGameState((prev) => ({
      ...prev,
      betIncreaseProposal: null,
    }));
  }, [clearBotVoteTimers]);

  // Bot proposal trigger logic for Mode C (Symétrique)
  useEffect(() => {
    if (gameState.phase !== 'PARTIE_OVER') return;
    if (gameState.soloBetIncreaseMode !== 'symetrique') return;
    if (gameState.betIncreaseProposal) return;
    if (hasRolledBetProposalForPartieRef.current) return;

    hasRolledBetProposalForPartieRef.current = true;

    const roll = Math.random();
    if (roll > 0.25) return; // 25% trigger probability per game end

    const activePlayers = gameState.players.filter(p => !p.isEliminated);
    if (activePlayers.length <= 1) return;

    const bots = activePlayers.filter(p => !p.isHuman);
    if (bots.length === 0) return;

    // Bot with maximum capital is the potential proposer
    const maxBot = bots.reduce((prev, current) => (prev.capital > current.capital) ? prev : current);
    const averageOthers = activePlayers
      .filter(p => p.id !== maxBot.id)
      .reduce((sum, p) => sum + p.capital, 0) / (activePlayers.length - 1);

    if (maxBot.capital > averageOthers * 1.4 && maxBot.capital > gameState.baseBet * 3) {
      const currentBet = gameState.baseBet;
      const proposedBet = currentBet + 5 + Math.floor(Math.random() * 2) * 5; // increment +5 or +10
      
      const minCapital = activePlayers.reduce((min, p) => Math.min(min, p.capital), Infinity);
      if (proposedBet > minCapital || proposedBet <= currentBet) return;

      const proposalId = `bet_inc_${Date.now()}`;
      const agreedPlayerIds = activePlayers.filter(p => !p.isHuman).map(p => p.id);
      const botIndex = gameState.players.findIndex(p => p.id === maxBot.id);

      const triggerTimeout = setTimeout(() => {
        setGameState((prev) => {
          if (prev.phase !== 'PARTIE_OVER' || prev.betIncreaseProposal) return prev;

          const proposalEmotes = [
            `Et si on jouait sérieusement ? On monte la mise à ${proposedBet} 🪙 ?`,
            `Je sens la chance aujourd’hui ! On passe à ${proposedBet} 🪙 ?`,
            `Qui a le courage de miser ${proposedBet} 🪙 dès la prochaine donne ?`,
            `On augmente l’enjeu à ${proposedBet} 🪙, ça vous va ?`,
          ][Math.floor(Math.random() * 4)];
          
          sendEmote(proposalEmotes, '🪙', botIndex);

          return {
            ...prev,
            betIncreaseProposal: {
              id: proposalId,
              proposedBet,
              proposerId: maxBot.id,
              proposerName: maxBot.name,
              agreedPlayerIds,
              createdAt: Date.now(),
              expiresAt: Date.now() + 15000,
            },
          };
        });
      }, 1500);

      // Timeout for expiration: after 16s, if user didn't accept, clear proposal automatically
      const expireTimeout = setTimeout(() => {
        setGameState((prev) => {
          if (!prev.betIncreaseProposal || prev.betIncreaseProposal.id !== proposalId) return prev;
          return {
            ...prev,
            betIncreaseProposal: null,
          };
        });
      }, 16500);

      return () => {
        clearTimeout(triggerTimeout);
        clearTimeout(expireTimeout);
      };
    }
  }, [gameState.phase, gameState.soloBetIncreaseMode, gameState.players, gameState.baseBet, sendEmote]);

  return {
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
  };
}
