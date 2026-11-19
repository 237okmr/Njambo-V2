/**
 * Connexion Google : envoi des signaux anonymes depuis l'application (le script de index.html fait l'envoi, une fois par étape et par chargement).
 * Seul le code d'erreur Firebase (ex. « auth/popup-blocked ») transite : jamais de nom, de courriel ni de compte.
 */

export type AuthStep =
  | 'popup_start' | 'popup_ok' | 'popup_fail' | 'redirect_start' | 'redirect_ok' | 'redirect_fail' | 'redirect_lost'
  | 'id_refused' | 'id_repair' | 'id_norepair' | 'id_guest_forced';

type AuthWindow = { __njamboAuthSignal?: (step: string, detail?: string, relay?: boolean) => void };

export function reportAuthStep(step: AuthStep, detail?: string, relay: boolean = false): void {
  try {
    (window as unknown as AuthWindow).__njamboAuthSignal?.(step, detail, relay);
  } catch {
    // la mesure ne gêne jamais le jeu
  }
}
