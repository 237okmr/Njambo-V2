/**
 * Kora Cash côté joueur — fonctions pures d'affichage et de saisie (aucun réseau, aucun délai, aucun secret).
 * Montants en FCFA entiers.
 */

export type KoraCashEnvironment = 'DEMO' | 'LIVE';

/** SIMULATED : dépôt fictif interne (démo). CAMPAY : dépôt Mobile Money par Campay (bac à sable tant que le retrait n’est pas livré). */
export type KoraCashDepositMode = 'SIMULATED' | 'CAMPAY';

export interface KoraCashPublicStatus {
  enabled: boolean;
  environment: KoraCashEnvironment;
  /** Absent chez un serveur plus ancien : traité comme dépôt fictif. */
  depositMode?: KoraCashDepositMode;
}

/** Même minimum que le serveur (server/cash/depositRules.ts). Le serveur reste seul juge : ce chiffre ne sert qu'à guider la saisie. */
export const MIN_DEPOSIT_FCFA_CLIENT = 100;

export const QUICK_DEPOSIT_AMOUNTS: number[] = [500, 1000, 5000, 10000];

/** Limites du paiement de test Campay en démo (le bac à sable Campay refuse plus de 25 FCFA). Mêmes valeurs que server/cash/campayRules.ts ; le serveur reste seul juge. */
export const CAMPAY_DEMO_MIN_FCFA_CLIENT = 10;
export const CAMPAY_DEMO_MAX_FCFA_CLIENT = 25;
export const CAMPAY_DEMO_QUICK_AMOUNTS: number[] = [10, 25];

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
export function parseTypedAmount(raw: string, limits?: { min: number; max?: number }): TypedAmountResult {
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
  const min = limits?.min ?? MIN_DEPOSIT_FCFA_CLIENT;
  if (amount < min) {
    return { ok: false, error: `Le dépôt minimum est de ${formatFcfa(min)}.` };
  }
  if (limits?.max !== undefined && amount > limits.max) {
    return { ok: false, error: `Le dépôt maximum est de ${formatFcfa(limits.max)}.` };
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
  /** true : le joueur saisit son numéro Mobile Money avant de payer. */
  needsPhone: boolean;
  /** Boutons de montant rapide proposés. */
  quickAmounts: number[];
  /** Plus petit montant accepté à la saisie. */
  minAmount: number;
  /** Plus grand montant accepté à la saisie ; null : aucun plafond. */
  maxAmount: number | null;
}

/** Libellés selon l'environnement et la méthode : en démo, seul le paiement Campay de test est proposé. */
export function getDepositUi(environment: KoraCashEnvironment, depositMode: KoraCashDepositMode = 'SIMULATED'): DepositUi {
  if (environment === 'DEMO') {
    if (depositMode === 'CAMPAY') {
      return {
        banner: 'Mode démo : paiement de test avec Campay. Attention : ton compte Mobile Money est réellement débité du montant choisi, mais ce solde de test ne peut pas être retiré.',
        buttonLabel: 'Payer par Mobile Money (test)',
        canDeposit: true,
        needsPhone: true,
        quickAmounts: CAMPAY_DEMO_QUICK_AMOUNTS,
        minAmount: CAMPAY_DEMO_MIN_FCFA_CLIENT,
        maxAmount: CAMPAY_DEMO_MAX_FCFA_CLIENT,
      };
    }
    // Le dépôt fictif n'existe plus : sans paiement Campay de test actif, aucun dépôt n'est proposé en démo.
    return {
      banner: 'Mode démo : aucun moyen de paiement de test n’est actif pour le moment.',
      buttonLabel: 'Déposer',
      canDeposit: false,
      needsPhone: false,
      quickAmounts: QUICK_DEPOSIT_AMOUNTS,
      minAmount: MIN_DEPOSIT_FCFA_CLIENT,
      maxAmount: null,
    };
  }
  return {
    banner: 'Argent réel : le dépôt par Mobile Money ouvre bientôt.',
    buttonLabel: 'Déposer',
    canDeposit: false,
    needsPhone: false,
    quickAmounts: QUICK_DEPOSIT_AMOUNTS,
    minAmount: MIN_DEPOSIT_FCFA_CLIENT,
    maxAmount: null,
  };
}
