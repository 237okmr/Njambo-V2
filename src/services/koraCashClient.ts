/**
 * Kora Cash côté joueur — appels aux routes serveur (/api/cash/status, /api/cash/wallet, dépôts Mobile Money).
 * Aucun secret, aucun délai ni minuterie : le serveur décide de tout (activation, environnement, compte Google, montants).
 */

import { auth } from '../lib/firebase';
import { KoraCashPublicStatus } from './koraCashFormat';

export interface KoraCashWallet {
  available: number;
  locked: number;
}

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Connexion requise.');
  }
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

function toWallet(raw: any): KoraCashWallet {
  const available = Number(raw?.available);
  const locked = Number(raw?.locked);
  return {
    available: Number.isFinite(available) ? available : 0,
    locked: Number.isFinite(locked) ? locked : 0,
  };
}

/** Statut public : « activé ou non » et environnement. Renvoie null au moindre doute (le menu affichera « bientôt »). */
export async function fetchKoraCashStatus(): Promise<KoraCashPublicStatus | null> {
  try {
    const res = await fetch('/api/cash/status', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.success !== true) return null;
    return {
      enabled: data.enabled === true,
      environment: data.environment === 'LIVE' ? 'LIVE' : 'DEMO',
      depositMode: data.depositMode === 'CAMPAY' ? 'CAMPAY' : 'SIMULATED',
    };
  } catch {
    return null;
  }
}

export async function fetchWallet(): Promise<KoraCashWallet> {
  const res = await fetch('/api/cash/wallet', { headers: await authHeaders(), cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Impossible de lire ton solde pour le moment.');
  }
  return toWallet(data.wallet);
}

export type CampayDepositState = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface CampayDepositStatus {
  depositId: string;
  state: CampayDepositState;
  message: string;
  /** Présent seulement quand le paiement vient d'être crédité : le nouveau solde. */
  wallet: KoraCashWallet | null;
}

function toCampayStatus(data: any): CampayDepositStatus {
  const state: CampayDepositState = data?.state === 'SUCCESS' ? 'SUCCESS' : data?.state === 'FAILED' ? 'FAILED' : 'PENDING';
  return {
    depositId: String(data?.depositId || ''),
    state,
    message: String(data?.message || data?.error || ''),
    wallet: data?.wallet ? toWallet(data.wallet) : null,
  };
}

/** Lance un dépôt Mobile Money (bac à sable). Le serveur valide le montant et le numéro, et décide seul du crédit. */
export async function startCampayDeposit(amount: number, phone: string): Promise<CampayDepositStatus> {
  const res = await fetch('/api/cash/deposit/campay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ amount, phone }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Le dépôt a échoué.');
  }
  return toCampayStatus(data);
}

export interface PendingDeposit {
  id: string;
  amount: number;
}

/** Dépôts Mobile Money lancés mais pas encore confirmés : permet de les vérifier après avoir fermé la fenêtre. */
export async function fetchPendingDeposits(): Promise<PendingDeposit[]> {
  const res = await fetch('/api/cash/deposits/pending', { headers: await authHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success || !Array.isArray(data.deposits)) {
    throw new Error(data?.error || 'Lecture des dépôts en attente impossible.');
  }
  return data.deposits
    .map((d: any) => ({ id: String(d?.id || ''), amount: Number(d?.amount) }))
    .filter((d: PendingDeposit) => d.id !== '' && Number.isFinite(d.amount));
}

export interface CashTablesView {
  enabled: boolean;
  betLevels: number[];
  minBuyInMultiple: number;
  maxBuyInMultiple: number;
  rakePercent: number;
  consented: boolean;
  /** Code de la table où le joueur a encore un siège, s'il en a une. */
  myTableCode: string | null;
}

/** Les tables sont-elles ouvertes, à quels niveaux et à quelle commission. Fermé au moindre doute. */
export async function fetchCashTables(): Promise<CashTablesView> {
  const data = await cashRequest<any>('/api/cash/tables', 'Lecture des tables impossible.');
  return {
    enabled: data.enabled === true,
    betLevels: Array.isArray(data.betLevels) ? data.betLevels.map(Number).filter(Number.isFinite) : [],
    minBuyInMultiple: Number(data.minBuyInMultiple) || 0,
    maxBuyInMultiple: Number(data.maxBuyInMultiple) || 0,
    rakePercent: Number(data.rakePercent) || 0,
    consented: data.consented === true,
    myTableCode: typeof data.myTableCode === 'string' ? data.myTableCode : null,
  };
}

/** Enregistre la confirmation « 18 ans et argent réel » : le serveur en garde la preuve. */
export async function acceptCashTableTerms(): Promise<void> {
  await cashRequest('/api/cash/tables/consent', 'Enregistrement impossible.', { method: 'POST' });
}

export interface WithdrawalSettingsView {
  enabled: boolean;
  feePercent: number;
  maxPhones: number;
  minAmount: number;
  maxAmount: number;
}

export interface CashPhone {
  phone: string;
  verified: boolean;
  operator?: string;
}

export type WithdrawalStatusView =
  | 'HOLDING'
  | 'AWAITING_APPROVAL'
  | 'READY'
  | 'SENDING'
  | 'PROCESSING'
  | 'REVIEW'
  | 'REFUNDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED';

export interface WithdrawalView {
  id: string;
  amount: number;
  fee: number;
  net: number;
  phone: string;
  status: WithdrawalStatusView;
  createdAt: number;
  note?: string;
}

async function cashRequest<T>(url: string, fallbackError: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { ...(init?.headers || {}), ...(await authHeaders()) } });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || fallbackError);
  }
  return data as T;
}

/** Le retrait est-il ouvert, à quels frais et dans quelles limites. Fermé au moindre doute. */
export async function fetchWithdrawalSettings(): Promise<WithdrawalSettingsView> {
  const data = await cashRequest<any>('/api/cash/withdrawal-settings', 'Lecture des réglages impossible.');
  return {
    enabled: data.enabled === true,
    feePercent: Number(data.feePercent) || 0,
    maxPhones: Number(data.maxPhones) || 0,
    minAmount: Number(data.minAmount) || 0,
    maxAmount: Number(data.maxAmount) || 0,
  };
}

export async function fetchPhones(): Promise<CashPhone[]> {
  return (await cashRequest<{ phones: CashPhone[] }>('/api/cash/phones', 'Lecture de tes numéros impossible.')).phones;
}

export async function addCashPhone(phone: string): Promise<CashPhone[]> {
  const data = await cashRequest<{ phones: CashPhone[] }>('/api/cash/phones', 'Ajout du numéro impossible.', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  return data.phones;
}

export async function removeCashPhone(phone: string): Promise<CashPhone[]> {
  const data = await cashRequest<{ phones: CashPhone[] }>(`/api/cash/phones/${encodeURIComponent(phone)}`, 'Suppression du numéro impossible.', { method: 'DELETE' });
  return data.phones;
}

export async function fetchWithdrawals(): Promise<WithdrawalView[]> {
  return (await cashRequest<{ withdrawals: WithdrawalView[] }>('/api/cash/withdrawals', 'Lecture de tes retraits impossible.')).withdrawals;
}

export async function requestWithdrawal(amount: number, phone: string): Promise<{ withdrawal: WithdrawalView; message?: string }> {
  return cashRequest('/api/cash/withdrawal', 'La demande de retrait a échoué.', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, phone }),
  });
}

export async function verifyWithdrawal(id: string): Promise<WithdrawalView> {
  return (await cashRequest<{ withdrawal: WithdrawalView }>(`/api/cash/withdrawal/${encodeURIComponent(id)}/verify`, 'Relecture impossible.', { method: 'POST' })).withdrawal;
}

export async function cancelWithdrawal(id: string): Promise<WithdrawalView> {
  return (await cashRequest<{ withdrawal: WithdrawalView }>(`/api/cash/withdrawal/${encodeURIComponent(id)}/cancel`, 'Annulation impossible.', { method: 'POST' })).withdrawal;
}

/** « Vérifier mon paiement » : le serveur relit le paiement chez Campay et crédite seulement s'il est confirmé. */
export async function verifyCampayDeposit(depositId: string): Promise<CampayDepositStatus> {
  const res = await fetch(`/api/cash/deposit/${encodeURIComponent(depositId)}/verify`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Vérification impossible pour le moment.');
  }
  return toCampayStatus(data);
}
