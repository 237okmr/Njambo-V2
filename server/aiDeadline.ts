import { getEngineConfig } from './engine/engineConfig';
import { PARAM_BY_KEY } from './engine/engineParams';

/**
 * Délai maximal d'un appel à l'IA : sans lui, un appel qui ne répond jamais garderait le copilote occupé jusqu'au redémarrage
 * du serveur. Le mot « timeout » du message fait reconnaître l'erreur comme passagère, donc le modèle de secours peut prendre le relais.
 */
export class AiDeadlineError extends Error {
  constructor(ms: number) {
    super(`timeout : l'IA n'a pas répondu dans le délai prévu (${Math.round(ms / 1000)} s).`);
    this.name = 'AiDeadlineError';
  }
}

/** Lance le travail et abandonne au délai : le signal annule l'appel en cours, la promesse se termine dans tous les cas. */
export function runWithDeadline<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new AiDeadlineError(ms));
    }, ms);
    work(controller.signal).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Délai réglé dans katika (copilotAiTimeoutSeconds). */
export function copilotAiTimeoutMs(): number {
  const cfg = getEngineConfig() as unknown as Record<string, unknown>;
  const configured = Number(cfg.copilotAiTimeoutSeconds);
  const seconds = Number.isFinite(configured) && configured > 0 ? configured : Number(PARAM_BY_KEY.copilotAiTimeoutSeconds.default);
  return Math.round(seconds * 1000);
}
