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
  /** Frais de dépôt à la charge du joueur. */
  depositFeePercent?: number;
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

/** Montant net annoncé avant confirmation. Même calcul que le serveur (server/cash/withdrawalRules.ts), qui reste seul juge. */
export function quoteWithdrawal(amount: number, feePercent: number): { fee: number; net: number } {
  const fee = Math.ceil(Math.round(amount * feePercent * 100) / 10000);
  return { fee, net: amount - fee };
}

/** Texte du suivi d'une demande de retrait. */
export function withdrawalStatusLabel(status: string): string {
  switch (status) {
    case 'AWAITING_APPROVAL':
      return 'En attente de validation';
    case 'HOLDING':
    case 'READY':
    case 'SENDING':
    case 'PROCESSING':
      return 'En cours d’envoi';
    case 'REVIEW':
      return 'En vérification';
    case 'REFUNDING':
      return 'Remboursement en cours';
    case 'SUCCESS':
      return 'Envoyé';
    case 'FAILED':
      return 'Échoué, argent rendu';
    case 'CANCELLED':
      return 'Annulé, argent rendu';
    default:
      return 'En cours';
  }
}

/** Libellé d'une ligne d'historique. Le signe du montant distingue une partie gagnée d'une partie perdue. */
export function cashMovementLabel(kind: string, amount: number): string {
  switch (kind) {
    case 'DEPOSIT':
      return 'Dépôt';
    case 'TABLE_BUYIN':
      return 'Entrée à une table';
    case 'TABLE_CASHOUT':
      return 'Sortie de table';
    case 'TABLE_SETTLEMENT':
      return amount >= 0 ? 'Partie gagnée' : 'Partie perdue';
    case 'WITHDRAWAL_HOLD':
      return 'Retrait';
    case 'WITHDRAWAL_REFUND':
      return 'Retrait rendu';
    case 'ADJUSTMENT':
      return 'Correction';
    default:
      return 'Mouvement';
  }
}

/** 1250 devient « +1 250 FCFA ». Le signe moins vient de formatFcfa. */
export function formatSignedFcfa(amount: number): string {
  return `${amount > 0 ? '+' : ''}${formatFcfa(amount)}`;
}

export type KoraCashTab = 'tables' | 'wallet' | 'history' | 'account';

/** Onglet d'arrivée : Tables si le joueur peut s'y asseoir ou y retourner, sinon Portefeuille. */
export function defaultKoraCashTab(
  tables: { enabled: boolean; betLevels: number[]; minBuyInMultiple: number; myTableCode: string | null } | null,
  available: number
): KoraCashTab {
  if (!tables || !tables.enabled) return 'wallet';
  if (tables.myTableCode) return 'tables';
  if (tables.betLevels.length === 0) return 'wallet';
  return available >= Math.min(...tables.betLevels) * tables.minBuyInMultiple ? 'tables' : 'wallet';
}

/** Bandeau toujours visible sur la page : on sait d'un coup d'œil si l'argent est réel. */
export function cashEnvironmentLabel(environment: KoraCashEnvironment): string {
  return environment === 'LIVE' ? 'Argent réel' : 'Démo : solde de test';
}

/** Badge court de Kora Cash sur l'accueil. */
export function cashEnvironmentBadge(environment: KoraCashEnvironment | undefined): string {
  return environment === 'LIVE' ? 'Argent réel' : 'Démo';
}

/** Messages du suivi d'un dépôt. */
export const DEPOSIT_CONFIRMED_TEXT = 'Paiement confirmé : ton solde de test est crédité.';
export const NO_PAYMENT_METHOD_TEXT = 'Aucun moyen de paiement de test n’est actif pour le moment.';

/** Numéro enregistré (237677123412) affiché lisiblement : 6 77 12 34 12. */
export function formatPhone(phone: string): string {
  const local = phone.startsWith('237') ? phone.slice(3) : phone;
  if (local.length !== 9) return phone;
  return `${local[0]} ${local.slice(1, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7)}`;
}

/** Libellés selon l'environnement et la méthode : en démo, seul le paiement Campay de test est proposé. */
export function getDepositUi(environment: KoraCashEnvironment, depositMode: KoraCashDepositMode = 'SIMULATED', canWithdraw: boolean = false): DepositUi {
  if (environment === 'DEMO') {
    if (depositMode === 'CAMPAY') {
      return {
        banner: canWithdraw
          ? 'Mode démo : paiement de test avec Campay. Attention : ton compte Mobile Money est réellement débité du montant choisi. Tu peux retirer ce solde vers un numéro vérifié.'
          : 'Mode démo : paiement de test avec Campay. Attention : ton compte Mobile Money est réellement débité du montant choisi, mais ce solde de test ne peut pas être retiré.',
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
