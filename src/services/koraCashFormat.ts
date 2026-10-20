/**
 * Kora Cash côté joueur — fonctions pures d'affichage et de saisie (aucun réseau, aucun délai, aucun secret).
 * Montants en FCFA entiers.
 */

export type KoraCashEnvironment = 'DEMO' | 'LIVE';

export interface KoraCashPublicStatus {
  enabled: boolean;
  environment: KoraCashEnvironment;
}

/** Même minimum que le serveur (server/cash/depositRules.ts). Le serveur reste seul juge : ce chiffre ne sert qu'à guider la saisie. */
export const MIN_DEPOSIT_FCFA_CLIENT = 100;

export const QUICK_DEPOSIT_AMOUNTS: number[] = [500, 1000, 5000, 10000];

/** Espace fine insécable (U+202F), écrite par son code : aucun caractère invisible dans le fichier. */
export const NARROW_NBSP = String.fromCharCode(0x202f);

/** 12500 devient « 12 500 FCFA » (espace fine insécable). Tout ce qui n'est pas un nombre fini donne « 0 FCFA ». */
export function formatFcfa(amount: unknown): string {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? Math.trunc(amount) : 0;
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NARROW_NBSP);
  return `${sign}${digits} FCFA`;
}

export interface TypedAmountResult {
  ok: boolean;
  amount?: number;
  error?: string;
}

/** Lit un montant saisi au clavier : chiffres uniquement (tous les espaces, y compris insécables, sont tolérés), au moins le minimum. */
export function parseTypedAmount(raw: string): TypedAmountResult {
  const cleaned = String(raw ?? '').replace(/\s/g, '');
  if (cleaned === '') {
    return { ok: false, error: 'Choisis ou saisis un montant.' };
  }
  if (!/^\d+$/.test(cleaned)) {
    return { ok: false, error: 'Saisis uniquement des chiffres, sans virgule ni point.' };
  }
  const amount = Number(cleaned);
  if (!Number.isSafeInteger(amount)) {
    return { ok: false, error: 'Montant trop grand.' };
  }
  if (amount < MIN_DEPOSIT_FCFA_CLIENT) {
    return { ok: false, error: `Le dépôt minimum est de ${formatFcfa(MIN_DEPOSIT_FCFA_CLIENT)}.` };
  }
  return { ok: true, amount };
}

export type KoraCashEntryState = 'COMING_SOON' | 'LOGIN_REQUIRED' | 'OPEN';

/** État de l'entrée du menu : désactivé ou statut inconnu = « bientôt », sinon connexion Google requise, sinon ouvert. */
export function resolveEntryState(status: KoraCashPublicStatus | null, isGoogleLoggedIn: boolean): KoraCashEntryState {
  if (!status || status.enabled !== true) return 'COMING_SOON';
  return isGoogleLoggedIn ? 'OPEN' : 'LOGIN_REQUIRED';
}

export interface DepositUi {
  banner: string;
  buttonLabel: string;
  /** false : aucun bouton de dépôt n'est proposé (le dépôt réel n'est pas encore ouvert). */
  canDeposit: boolean;
}

/** Libellés selon l'environnement : en démo, tout est annoncé comme fictif. */
export function getDepositUi(environment: KoraCashEnvironment): DepositUi {
  if (environment === 'DEMO') {
    return {
      banner: 'Mode démo : l’argent ci-dessous est fictif et ne peut pas être retiré.',
      buttonLabel: 'Recharger (fictif)',
      canDeposit: true,
    };
  }
  return {
    banner: 'Argent réel : le dépôt par Mobile Money ouvre bientôt.',
    buttonLabel: 'Déposer',
    canDeposit: false,
  };
}
