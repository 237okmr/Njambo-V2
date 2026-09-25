/**
 * Calcul pur du délai de reconnexion progressive (1, 2, 4, 8 s..., plafonné, avec une variation
 * aléatoire de plus ou moins 20 % pour éviter que plusieurs onglets ne retentent exactement au même
 * instant). Séparé de websocketService.ts pour rester facilement testable sans navigateur.
 */
export function computeReconnectDelayMs(
  attempt: number,
  baseMs: number,
  maxMs: number,
  jitterRatio: number = 0.2,
  random: () => number = Math.random
): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const raw = Math.min(maxMs, baseMs * Math.pow(2, safeAttempt));
  const jitter = 1 + (random() * 2 - 1) * jitterRatio; // dans [1 - jitterRatio, 1 + jitterRatio]
  return Math.max(0, Math.round(raw * jitter));
}
