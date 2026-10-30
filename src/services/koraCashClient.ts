/**
 * Kora Cash côté joueur — appels aux routes serveur (/api/cash/status, /api/cash/wallet, /api/cash/deposit/simulate).
 * Aucun secret, aucun délai ni minuterie : le serveur décide de tout (activation, environnement, compte Google, montants).
 */

import { auth } from '../lib/firebase';
import { KoraCashPublicStatus } from './koraCashFormat';

export interface KoraCashWallet {
  available: number;
  locked: number;
}

export interface SimulatedDepositResult {
  depositId: string;
  amount: number;
  wallet: KoraCashWallet;
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

/** Dépôt fictif (démo uniquement). Le serveur refuse si Kora Cash est désactivé, en LIVE ou si le compte n'est pas Google. */
export async function simulateDeposit(amount: number): Promise<SimulatedDepositResult> {
  const res = await fetch('/api/cash/deposit/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ amount }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Le dépôt a échoué.');
  }
  return {
    depositId: String(data.deposit?.id || ''),
    amount: Number(data.deposit?.amount) || amount,
    wallet: toWallet(data.wallet),
  };
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
