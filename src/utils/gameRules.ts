import { Card } from '../types';

export interface ComputePartieOutcomeParams {
  fifthTrickWinnerIndex: number;
  fifthTrickWinningValue: number;
  fourthTrickWinnerIndex?: number | null;
  fourthTrickWinningValue?: number | null;
  enableDoubleKora?: boolean;
}

export interface PartieOutcomeResult {
  winType: 'STANDARD' | 'KORA' | 'DOUBLE_KORA';
  multiplier: number;
  winnerIndex: number;
}

/**
 * Computes the win outcome (STANDARD, KORA, DOUBLE_KORA) and score multiplier for a completed Partie.
 */
export function computePartieOutcome(params: ComputePartieOutcomeParams): PartieOutcomeResult {
  const {
    fifthTrickWinnerIndex,
    fifthTrickWinningValue,
    fourthTrickWinnerIndex,
    fourthTrickWinningValue,
    enableDoubleKora = false,
  } = params;

  if (fifthTrickWinningValue === 3) {
    if (
      enableDoubleKora &&
      fourthTrickWinnerIndex === fifthTrickWinnerIndex &&
      fourthTrickWinningValue === 3
    ) {
      return {
        winType: 'DOUBLE_KORA',
        multiplier: 4,
        winnerIndex: fifthTrickWinnerIndex,
      };
    }
    return {
      winType: 'KORA',
      multiplier: 2,
      winnerIndex: fifthTrickWinnerIndex,
    };
  }

  return {
    winType: 'STANDARD',
    multiplier: 1,
    winnerIndex: fifthTrickWinnerIndex,
  };
}

export interface ApplyPartiePayoutParams {
  capitals: number[];
  isEliminated: boolean[];
  winnerIndex: number;
  pot: number;
  baseBet: number;
  multiplier: number;
  rakePct?: number;
  exemptFromPenalty?: boolean[];
}

export interface ApplyPartiePayoutResult {
  capitals: number[];
  eliminated: boolean[];
  extraCollected: number;
  winnerReceived: number;
}

/**
 * Applies end-of-partie chips distribution and penalty calculations.
 */
export function applyPartiePayout(params: ApplyPartiePayoutParams): ApplyPartiePayoutResult {
  const {
    capitals,
    isEliminated,
    winnerIndex,
    pot,
    baseBet,
    multiplier,
    rakePct = 0,
    exemptFromPenalty,
  } = params;

  const newCapitals = [...capitals];
  let extraCollected = 0;
  const penaltyPerLoser = (multiplier - 1) * baseBet;

  for (let i = 0; i < newCapitals.length; i++) {
    const isExempt = exemptFromPenalty ? Boolean(exemptFromPenalty[i]) : false;
    if (i !== winnerIndex && !isEliminated[i] && !isExempt) {
      const penalty = Math.min(newCapitals[i], penaltyPerLoser);
      newCapitals[i] -= penalty;
      extraCollected += penalty;
    }
  }

  const totalBeforeRake = pot + extraCollected;
  const rakeAmount = rakePct > 0 ? Math.floor((totalBeforeRake * rakePct) / 100) : 0;
  const winnerReceived = totalBeforeRake - rakeAmount;

  newCapitals[winnerIndex] += winnerReceived;

  const eliminated = newCapitals.map(
    (cap, i) => isEliminated[i] || cap < baseBet
  );

  return {
    capitals: newCapitals,
    eliminated,
    extraCollected,
    winnerReceived,
  };
}

export interface DetectInstantWinParams {
  hands: { value: number }[][];
  eligible: boolean[];
  dealerIndex: number;
  enableUnder21?: boolean;
}

export interface InstantWinResult {
  winnerIndex: number;
  winType: 'THREE_SEVENS' | 'UNDER_21';
}

/**
 * Detects instant wins at deal time (THREE_SEVENS or UNDER_21).
 */
export function detectInstantWin(params: DetectInstantWinParams): InstantWinResult | null {
  const { hands, eligible, dealerIndex, enableUnder21 = false } = params;
  const numPlayers = hands.length;
  if (numPlayers === 0) return null;

  // First player after dealer
  let leadIndex = (dealerIndex + 1) % numPlayers;
  let offset = 0;
  while (eligible.length > 0 && !eligible[leadIndex] && offset < numPlayers) {
    leadIndex = (leadIndex + 1) % numPlayers;
    offset++;
  }

  // Check A: Three Sevens (THREE_SEVENS)
  for (let i = 0; i < numPlayers; i++) {
    const pIdx = (leadIndex + i) % numPlayers;
    if (eligible[pIdx] && hands[pIdx]) {
      const sevensCount = hands[pIdx].filter((card) => card.value === 7).length;
      if (sevensCount >= 3) {
        return {
          winnerIndex: pIdx,
          winType: 'THREE_SEVENS',
        };
      }
    }
  }

  // Check B: Under 21 (UNDER_21)
  if (enableUnder21) {
    let under21WinnerIdx: number | null = null;
    let lowestSum = 999;
    let lowestOrderDistance = 999;

    for (let i = 0; i < numPlayers; i++) {
      const pIdx = (leadIndex + i) % numPlayers;
      if (eligible[pIdx] && hands[pIdx] && hands[pIdx].length === 5) {
        const handSum = hands[pIdx].reduce((acc, card) => acc + card.value, 0);
        const orderDistance = i;

        if (handSum <= 21) {
          if (
            handSum < lowestSum ||
            (handSum === lowestSum && orderDistance < lowestOrderDistance)
          ) {
            lowestSum = handSum;
            lowestOrderDistance = orderDistance;
            under21WinnerIdx = pIdx;
          }
        }
      }
    }

    if (under21WinnerIdx !== null) {
      return {
        winnerIndex: under21WinnerIdx,
        winType: 'UNDER_21',
      };
    }
  }

  return null;
}
