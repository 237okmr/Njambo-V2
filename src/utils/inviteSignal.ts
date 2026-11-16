/**
 * Parcours d'invitation : envoi des signaux anonymes depuis l'application. Le script de index.html décide si la page a été ouverte par un lien
 * (canal, une seule fois par étape et par chargement) ; ici on ne fait que lui passer l'étape et un détail pris dans une liste fermée.
 * Aucun code de table, aucun nom, aucun montant ne transite jamais par ces signaux.
 */

export type InviteStep = 'card' | 'click' | 'later' | 'joined' | 'failed';

type InviteWindow = { __njamboInviteSignal?: (step: string, detail?: string) => void };

export function reportInviteStep(step: InviteStep, detail?: string): void {
  try {
    (window as unknown as InviteWindow).__njamboInviteSignal?.(step, detail);
  } catch {
    // la mesure ne gêne jamais le jeu
  }
}

/** Motif d'un échec de jointure : le code d'erreur du serveur ou du client (TIMEOUT, EXCEPTION). Le serveur le ramène à sa liste fermée. */
export function inviteFailureMotif(errorCode: unknown): string {
  return typeof errorCode === 'string' && errorCode ? errorCode : 'EXCEPTION';
}
