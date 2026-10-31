/**
 * Kora Cash côté joueur — solde partagé entre l'accueil et la fenêtre Kora Cash.
 * Le solde est relu par l'API sécurisée (jeton Google) à l'ouverture, au retour de l'application au premier plan,
 * et chaque fois que le serveur signale par la connexion temps réel qu'un mouvement vient d'être appliqué
 * (crédit d'un dépôt, par exemple). Aucune minuterie, aucune écoute directe de Firestore.
 */

import { useEffect, useState } from 'react';
import { fetchWallet, KoraCashWallet } from './koraCashClient';
import { wsService } from './websocketService';

export interface KoraCashWalletState {
  wallet: KoraCashWallet | null;
  loading: boolean;
  error: string | null;
}

const EMPTY_STATE: KoraCashWalletState = { wallet: null, loading: false, error: null };

let state: KoraCashWalletState = EMPTY_STATE;
let inFlight: Promise<void> | null = null;
let started = false;
const listeners = new Set<(s: KoraCashWalletState) => void>();

function publish(next: KoraCashWalletState): void {
  state = next;
  listeners.forEach((l) => l(state));
}

export function getKoraCashWalletState(): KoraCashWalletState {
  return state;
}

/** Relit le solde auprès du serveur. Deux demandes simultanées partagent la même lecture. */
export function refreshKoraCashWallet(): Promise<void> {
  if (inFlight) return inFlight;
  publish({ ...state, loading: true, error: null });
  inFlight = (async () => {
    try {
      const wallet = await fetchWallet();
      publish({ wallet, loading: false, error: null });
    } catch (err) {
      publish({ ...state, loading: false, error: err instanceof Error ? err.message : 'Impossible de lire ton solde.' });
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Applique un solde déjà connu (réponse d'un crédit confirmé). */
export function setKoraCashWallet(wallet: KoraCashWallet): void {
  publish({ wallet, loading: false, error: null });
}

export function resetKoraCashWallet(): void {
  publish(EMPTY_STATE);
}

function ensureStarted(): void {
  if (started) return;
  started = true;
  wsService.onCashWalletChanged(() => {
    if (listeners.size > 0) void refreshKoraCashWallet();
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && listeners.size > 0) void refreshKoraCashWallet();
    });
  }
}

export function subscribeKoraCashWallet(listener: (s: KoraCashWalletState) => void): () => void {
  ensureStarted();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Solde partagé et dynamique. enabled = false (non connecté, Kora Cash fermé) : aucun appel, état vide. */
export function useKoraCashWallet(enabled: boolean): KoraCashWalletState {
  const [snapshot, setSnapshot] = useState<KoraCashWalletState>(state);
  useEffect(() => {
    if (!enabled) {
      resetKoraCashWallet();
      setSnapshot(EMPTY_STATE);
      return;
    }
    const unsubscribe = subscribeKoraCashWallet(setSnapshot);
    setSnapshot(state);
    void refreshKoraCashWallet();
    return unsubscribe;
  }, [enabled]);
  return enabled ? snapshot : EMPTY_STATE;
}
