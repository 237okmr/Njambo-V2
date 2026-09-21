import type {
  PartieParticipantResult,
  PartieResult,
  PartieResultWinType,
  PartieEndReason,
} from '../types';

/**
 * Module pur de règlement d'une donne (aucune dépendance à React, au serveur ou à Firebase).
 * Référence unique pour le serveur, le client et la migration rétroactive.
 */

/** Multiplicateur Kora appliqué au partant : pénalité = (multiplicateur - 1) x mise. */
export const FORFAIT_PENALITE_MULTIPLICATEUR = 2;

/** Numéro de pli à partir duquel la pénalité de forfait s'applique (1 = dès le premier pli). */
export const FORFAIT_PENALITE_DES_PLI = 2;

/**
 * Inactivité (3 délais consécutifs) : le siège est-il gelé jusqu'à la fin de la manche comme pour un départ ?
 * Passer à false rétablit l'ancien comportement (réintégration à la donne suivante).
 */
export const FORFAIT_INACTIVITE_GELE_LE_SIEGE = true;

export interface ForfeitPenaltyParams {
  baseBet: number;
  /** Capital du joueur APRÈS paiement de sa mise. */
  capital: number;
  currentTrickNumber: number;
}

/** Pénalité de forfait : 0 avant le pli seuil, sinon (multiplicateur - 1) x mise plafonnée au capital. */
export function computeForfeitPenalty(params: ForfeitPenaltyParams): number {
  const { baseBet, capital, currentTrickNumber } = params;
  if (currentTrickNumber < FORFAIT_PENALITE_DES_PLI) return 0;
  const due = (FORFAIT_PENALITE_MULTIPLICATEUR - 1) * baseBet;
  return Math.max(0, Math.min(Math.max(0, capital), due));
}

export interface BuildPartieResultParams {
  id: string;
  roomId: string;
  mancheNumber: number;
  partieCount: number;
  baseBet: number;
  winnerId: string | null;
  winType: PartieResultWinType;
  endReason: PartieEndReason;
  participants: Array<Omit<PartieParticipantResult, 'net'>>;
  mancheOver?: boolean;
  createdAt?: number;
  /** Autorise des jetons détruits (plus aucun humain, reste d'une division entière). */
  allowBurned?: boolean;
}

export interface BuildPartieResultOutput {
  result: PartieResult;
  invariantOk: boolean;
  invariantError?: string;
}

/**
 * Construit un résultat de donne. Ne lance JAMAIS d'erreur : si l'invariant de conservation
 * est violé, `invariantOk` vaut false et `invariantError` décrit l'écart (à journaliser).
 * Le résultat est publié dans tous les cas.
 */
export function buildPartieResult(params: BuildPartieResultParams): BuildPartieResultOutput {
  const participants: PartieParticipantResult[] = params.participants.map((p) => ({
    ...p,
    net: p.gross - p.ante - p.penaltyPaid,
  }));

  const totalIn = participants.reduce((sum, p) => sum + p.ante + p.penaltyPaid, 0);
  const totalOut = participants.reduce((sum, p) => sum + p.gross, 0);
  const burned = totalIn - totalOut;

  let invariantOk = true;
  let invariantError: string | undefined;
  if (burned < 0) {
    invariantOk = false;
    invariantError = `Jetons créés : ${-burned} (sorties ${totalOut} > entrées ${totalIn}).`;
  } else if (burned > 0 && !params.allowBurned) {
    invariantOk = false;
    invariantError = `Jetons détruits non attendus : ${burned} (entrées ${totalIn}, sorties ${totalOut}).`;
  }

  const result: PartieResult = {
    id: params.id,
    roomId: params.roomId,
    mancheNumber: params.mancheNumber,
    partieCount: params.partieCount,
    baseBet: params.baseBet,
    winnerId: params.winnerId,
    winType: params.winType,
    endReason: params.endReason,
    participants,
    burned: Math.max(0, burned),
    mancheOver: Boolean(params.mancheOver),
    createdAt: params.createdAt ?? Date.now(),
  };

  return { result, invariantOk, invariantError };
}

export interface HistoryRecordEstimateParams {
  isWinner: boolean;
  winType: string;
  baseBet: number;
  playerCount: number;
}

/** Estimation du net d'un enregistrement d'historique (migration rétroactive). */
export function estimateNetFromHistoryRecord(params: HistoryRecordEstimateParams): number {
  const { isWinner, winType, baseBet } = params;
  const players = Math.max(2, params.playerCount || 2);
  const m = winType === 'DOUBLE_KORA' ? 4 : winType === 'KORA' ? 2 : 1;
  return isWinner ? m * baseBet * (players - 1) : -m * baseBet;
}
