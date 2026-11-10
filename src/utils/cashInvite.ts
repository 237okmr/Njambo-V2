/**
 * Invitation à une table Kora Cash : lien ?cash=CODE, texte de partage et mémoire du code le temps de la connexion.
 * Le lien ne porte que le code : le nom de l'hôte, la mise et la commission viennent du serveur, jamais de l'adresse.
 * Le paramètre ?join= reste réservé aux tables gratuites. Aucun délai, aucun secret ici.
 */

import { formatFcfa } from '../services/koraCashFormat';

export const CASH_INVITE_PARAM = 'cash';
const STORAGE_KEY = 'njambo_cash_invite';

/** Un code de table : 4 à 6 lettres ou chiffres, en majuscules. Chaîne vide si le texte n'en est pas un. */
export function normalizeCashInviteCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return /^[A-Z0-9]{4,6}$/.test(cleaned) ? cleaned : '';
}

/** Code d'invitation Kora Cash présent dans l'adresse (?cash=CODE), ou chaîne vide. */
export function readCashInviteCode(search: string): string {
  try {
    return normalizeCashInviteCode(new URLSearchParams(search).get(CASH_INVITE_PARAM));
  } catch {
    return '';
  }
}

/** Même adresse sans le paramètre d'invitation ; les autres paramètres sont conservés. */
export function stripCashInviteParam(search: string): string {
  try {
    const params = new URLSearchParams(search);
    params.delete(CASH_INVITE_PARAM);
    const rest = params.toString();
    return rest ? `?${rest}` : '';
  } catch {
    return '';
  }
}

export function buildCashInviteUrl(base: string, code: string): string {
  const clean = normalizeCashInviteCode(code);
  return clean ? `${base}?${CASH_INVITE_PARAM}=${clean}` : base;
}

export interface CashInviteTextInput {
  code: string;
  /** Mise de la table, en FCFA. */
  bet: number;
  /** Commission en % du pot gagné. */
  rakePercent: number;
}

/** Texte d'invitation : factuel, en FCFA, avec le rappel argent réel et 18 ans. Sans lien, sans promesse de gain. */
export function buildCashInviteText({ code, bet, rakePercent }: CashInviteTextInput): string {
  return [
    'Je t’invite à une table Kora Cash sur Njambo Kora.',
    `Mise : ${formatFcfa(bet)} · Commission : ${rakePercent} % du pot gagné`,
    'Argent réel, réservé aux 18 ans et plus : tu peux perdre ta mise.',
    `Table #${normalizeCashInviteCode(code) || code}`,
  ].join('\n');
}

export function buildCashInviteWhatsAppUrl(input: CashInviteTextInput & { url: string }): string {
  return `https://wa.me/?text=${encodeURIComponent(`${buildCashInviteText(input)}\n${input.url}`)}`;
}

/** Garde le code pendant la connexion Google (la page peut être rechargée). Sans stockage disponible : on s'en passe. */
export function rememberCashInviteCode(code: string): void {
  try {
    const clean = normalizeCashInviteCode(code);
    if (clean) window.sessionStorage.setItem(STORAGE_KEY, clean);
  } catch {
    // Stockage indisponible (navigation privée, aperçu) : l'invitation reste en mémoire vive.
  }
}

export function recallCashInviteCode(): string {
  try {
    return normalizeCashInviteCode(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return '';
  }
}

export function forgetCashInviteCode(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Rien à oublier si le stockage est indisponible.
  }
}
