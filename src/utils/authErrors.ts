/**
 * Connexion Google : que dire au joueur selon la cause de l'échec, et que remonter à katika.
 * Fonctions pures. Aucun nom, aucun courriel : seul le code d'erreur de Firebase (ex. « auth/popup-blocked ») est remonté.
 */

export type GoogleSignInOutcome = { ok: true } | { ok: false; message: string | null };

export interface AuthFailureView {
  /** Texte pour le joueur ; null : annulation volontaire, on n'affiche rien. */
  message: string | null;
  /** Remonter le code à katika (échec inattendu ou lié à l'appareil). */
  report: boolean;
}

export const GENERIC_SIGN_IN_ERROR = 'Erreur lors de la connexion. Tes données locales restent intactes.';

/** Code Firebase de l'erreur (« auth/… »), ou « inconnu ». Une assertion interne de Firebase est rangée à part. */
export function authErrorCode(err: unknown): string {
  const e = (err ?? {}) as { code?: unknown; message?: unknown };
  if (typeof e.code === 'string' && e.code) return e.code;
  if (typeof e.message === 'string' && /INTERNAL ASSERTION FAILED/i.test(e.message)) return 'firebase-assertion';
  return 'inconnu';
}

export function describeGoogleSignInError(code: string): AuthFailureView {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return { message: null, report: false };
    case 'auth/popup-blocked':
      return {
        message: 'Ton navigateur a bloqué la fenêtre Google. Autorise les fenêtres pour ce site, ou ouvre le jeu directement dans Safari ou Chrome, puis réessaie.',
        report: true,
      };
    case 'auth/network-request-failed':
      return { message: 'Pas de connexion internet. Vérifie ton réseau puis réessaie.', report: false };
    case 'auth/too-many-requests':
      return { message: 'Trop de tentatives de connexion. Patiente un moment avant de réessayer.', report: false };
    case 'auth/operation-not-supported-in-this-environment':
    case 'auth/web-storage-unsupported':
      return {
        message: 'Ce navigateur ne permet pas la connexion Google ici. Ouvre le jeu directement dans Safari ou Chrome, puis réessaie.',
        report: true,
      };
    case 'auth/user-disabled':
      return { message: 'Ce compte Google est désactivé pour le jeu. Contacte l’équipe.', report: false };
    case 'auth/unauthorized-domain':
      return { message: 'La connexion Google n’est pas autorisée depuis cette adresse. Préviens l’équipe.', report: true };
    default:
      return { message: GENERIC_SIGN_IN_ERROR, report: true };
  }
}

/** Texte envoyé à katika pour un échec de connexion : le code seulement. */
export function authFailureReportMessage(code: string): string {
  return `Connexion Google : ${code}`;
}
