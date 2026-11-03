/**
 * Limites du copilote, en mémoire du serveur. Plafond horaire commun (protège le quota Gemini gratuit), plafond horaire par admin
 * (un admin ne peut pas épuiser le quota des autres), une seule demande à la fois par admin, et un nombre maximal de demandes
 * simultanées pour tout le monde. Le propriétaire n'a que le plafond commun.
 */

// delay-ok: définition de la fenêtre « par heure » des plafonds du copilote, pas un délai d'attente
export const AI_WINDOW_MS = 60 * 60 * 1000;

export interface AiLimiterDeps {
  now: () => number;
  maxPerHour: () => number;
  maxPerAdminPerHour: () => number;
  maxConcurrent: () => number;
}

export type AiLimitResult = { allowed: true } | { allowed: false; message: string; retryAfterMinutes: number };

export interface AiQuotaStatus {
  used: number;
  max: number;
  resetInMinutes: number;
  /** Demandes de ce compte sur l'heure, et son plafond (null pour le propriétaire). */
  mine: number;
  myMax: number | null;
}

export function createAiLimiter(deps: AiLimiterDeps) {
  const calls: Array<{ uid: string; at: number }> = [];
  const running = new Set<string>();

  function purge(): void {
    const limit = deps.now() - AI_WINDOW_MS;
    while (calls.length > 0 && calls[0].at <= limit) calls.shift();
  }

  const minutesUntilFree = (oldest: number) => Math.max(1, Math.ceil((oldest + AI_WINDOW_MS - deps.now()) / 60000));

  return {
    check(uid: string, isOwner: boolean): AiLimitResult {
      purge();
      if (running.has(uid)) {
        // delay-ok: indication affichée « réessaie dans 1 min », pas un délai appliqué
        return { allowed: false, message: 'Ta demande précédente est encore en cours, patiente quelques secondes.', retryAfterMinutes: 1 };
      }
      if (running.size >= deps.maxConcurrent()) {
        // delay-ok: indication affichée « réessaie dans 1 min », pas un délai appliqué
        return { allowed: false, message: 'Le copilote répond déjà à d\'autres admins, réessaie dans un instant.', retryAfterMinutes: 1 };
      }
      if (calls.length >= deps.maxPerHour()) {
        const wait = minutesUntilFree(calls[0].at);
        return { allowed: false, message: `Limite du copilote atteinte pour tout le monde, réessaie dans ${wait} min.`, retryAfterMinutes: wait };
      }
      if (!isOwner) {
        const mine = calls.filter((c) => c.uid === uid);
        if (mine.length >= deps.maxPerAdminPerHour()) {
          const wait = minutesUntilFree(mine[0].at);
          return { allowed: false, message: `Ta limite de demandes au copilote est atteinte, réessaie dans ${wait} min.`, retryAfterMinutes: wait };
        }
      }
      return { allowed: true };
    },
    acquire(uid: string): void {
      running.add(uid);
      calls.push({ uid, at: deps.now() });
    },
    /** Appels Gemini supplémentaires d'une même demande (relances d'un visuel). */
    count(uid: string, extra: number): void {
      for (let i = 0; i < extra; i++) calls.push({ uid, at: deps.now() });
    },
    release(uid: string): void {
      running.delete(uid);
    },
    status(uid: string, isOwner: boolean): AiQuotaStatus {
      purge();
      const mine = calls.filter((c) => c.uid === uid).length;
      return {
        used: calls.length,
        max: deps.maxPerHour(),
        resetInMinutes: calls.length > 0 ? minutesUntilFree(calls[0].at) : 0,
        mine,
        myMax: isOwner ? null : deps.maxPerAdminPerHour(),
      };
    },
  };
}
