import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KoraCashWallet,
  PendingDeposit,
  fetchPendingDeposits,
  startCampayDeposit,
  verifyCampayDeposit,
} from '../services/koraCashClient';
import { DepositUi, parseTypedAmount } from '../services/koraCashFormat';
import { refreshKoraCashWallet, setKoraCashWallet } from '../services/koraCashWalletStore';
import { wsService } from '../services/websocketService';
import { getPublicParamNumber } from '../services/publicConfig';

// Paiements que le joueur a déclarés annulés : on arrête de les suivre sur cet appareil. Le serveur garde sa vérité :
// si un tel paiement aboutissait malgré tout, Campay le signalerait et le solde serait crédité.
const DISMISSED_KEY = 'koraCashDismissedDeposits';
const DISMISSED_MAX = 30;

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-DISMISSED_MAX)));
  } catch {
    // stockage indisponible : le paiement réapparaîtra à la prochaine ouverture, sans conséquence
  }
}

export type KoraCashMessage = { type: 'success' | 'error' | 'info'; text: string } | null;

/**
 * Dépôt Mobile Money et suivi des paiements en attente. Porté par la page, pas par l'onglet : le suivi continue
 * quand le joueur change d'onglet. Le serveur reste seul juge du crédit.
 */
export function useKoraCashDeposits(ui: DepositUi, isLoggedIn: boolean, loadPhones: () => Promise<void>) {
  const loadWallet = useCallback(() => refreshKoraCashWallet(), []);
  const setWallet = (next: KoraCashWallet) => setKoraCashWallet(next);
  const [selectedQuick, setSelectedQuick] = useState<number | null>(null);
  const [typed, setTyped] = useState<string>('');
  const [depositing, setDepositing] = useState<boolean>(false);
  const [message, setMessage] = useState<KoraCashMessage>(null);
  const [phone, setPhone] = useState<string>('');
  const [pendingDeposit, setPendingDeposit] = useState<{ id: string; text: string } | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);
  // Dépôts Mobile Money lancés mais pas encore confirmés, retrouvés côté serveur (même après fermeture de la page).
  const [listedPending, setListedPending] = useState<PendingDeposit[]>([]);
  const [verifyingListedId, setVerifyingListedId] = useState<string | null>(null);
  // Le bouton « Vérifier maintenant » n'apparaît qu'après un délai réglable dans katika : la confirmation est d'abord automatique.
  const [showManualVerify, setShowManualVerify] = useState<boolean>(false);
  // Vrai quand la relecture automatique a atteint son nombre d'essais sans réponse définitive : on le dit au joueur au lieu de tourner sans fin.
  const [autoStopped, setAutoStopped] = useState<boolean>(false);
  const hasPending = pendingDeposit !== null || listedPending.length > 0;
  const pendingRef = useRef(pendingDeposit);
  const listedRef = useRef(listedPending);
  pendingRef.current = pendingDeposit;
  listedRef.current = listedPending;
  const dismissedRef = useRef<string[]>(readDismissed());

  const loadListedPending = useCallback(async () => {
    try {
      const all = await fetchPendingDeposits();
      setListedPending(all.filter((d) => !dismissedRef.current.includes(d.id)));
    } catch {
      setListedPending([]);
    }
  }, []);

  // Le joueur dit avoir annulé ce paiement : on ne l'affiche plus ni ne le relit ici.
  const dismissPending = (id: string) => {
    dismissedRef.current = [...dismissedRef.current.filter((x) => x !== id), id];
    writeDismissed(dismissedRef.current);
    if (pendingRef.current?.id === id) setPendingDeposit(null);
    setListedPending((prev) => prev.filter((d) => d.id !== id));
    setMessage({ type: 'info', text: 'Compris : ce paiement n’est plus suivi ici. S’il avait été validé malgré tout, ton solde serait crédité et tu en serais prévenu.' });
  };

  useEffect(() => {
    if (isLoggedIn && ui.needsPhone) {
      void loadListedPending();
    } else {
      setListedPending([]);
    }
  }, [isLoggedIn, ui.needsPhone, loadListedPending]);

  const handleDeposit = async () => {
    setMessage(null);
    let amount: number;
    if (typed.trim() !== '') {
      const parsed = parseTypedAmount(typed, { min: ui.minAmount, max: ui.maxAmount ?? undefined });
      if (!parsed.ok || parsed.amount === undefined) {
        setMessage({ type: 'error', text: parsed.error || 'Montant invalide.' });
        return;
      }
      amount = parsed.amount;
    } else if (selectedQuick !== null) {
      amount = selectedQuick;
    } else {
      setMessage({ type: 'error', text: 'Choisis ou saisis un montant.' });
      return;
    }

    setDepositing(true);
    try {
      if (!ui.needsPhone) {
        setMessage({ type: 'error', text: 'Aucun moyen de paiement de test n’est actif pour le moment.' });
        return;
      }
      const started = await startCampayDeposit(amount, phone);
      setPendingDeposit({ id: started.depositId, text: started.message });
      setMessage(null);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Le dépôt a échoué.' });
    } finally {
      setDepositing(false);
    }
  };

  const handleVerify = async () => {
    if (!pendingDeposit) return;
    setVerifying(true);
    try {
      const status = await verifyCampayDeposit(pendingDeposit.id);
      if (status.state === 'SUCCESS') {
        if (status.wallet) {
          setWallet(status.wallet);
        } else {
          await loadWallet();
        }
        setPendingDeposit(null);
        setSelectedQuick(null);
        setTyped('');
        setMessage({ type: 'success', text: 'Paiement confirmé : ton solde de test est crédité.' });
      } else if (status.state === 'FAILED') {
        setPendingDeposit(null);
        setMessage({ type: 'error', text: status.message || 'Le paiement a échoué.' });
      } else {
        setPendingDeposit({ id: pendingDeposit.id, text: status.message || 'Paiement toujours en attente.' });
        setMessage({ type: 'info', text: status.message || 'Paiement toujours en attente.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Vérification impossible.' });
    } finally {
      setVerifying(false);
    }
  };

  // Relit en silence tous les paiements en attente (confirmation automatique). Les erreurs réseau sont ignorées : on réessaiera.
  const checkAllPending = async () => {
    const ids = new Set<string>();
    if (pendingRef.current) ids.add(pendingRef.current.id);
    listedRef.current.forEach((d) => ids.add(d.id));
    let changed = false;
    for (const id of ids) {
      try {
        const status = await verifyCampayDeposit(id);
        if (status.state === 'SUCCESS') {
          if (status.wallet) {
            setWallet(status.wallet);
          } else {
            await loadWallet();
          }
          if (pendingRef.current?.id === id) {
            setPendingDeposit(null);
            setSelectedQuick(null);
            setTyped('');
          }
          setMessage({ type: 'success', text: 'Paiement confirmé : ton solde de test est crédité.' });
          changed = true;
        } else if (status.state === 'FAILED') {
          if (pendingRef.current?.id === id) setPendingDeposit(null);
          setMessage({ type: 'error', text: status.message || 'Le paiement a échoué.' });
          changed = true;
        }
      } catch {
        // silencieux : prochaine relecture
      }
    }
    if (changed) await loadListedPending();
  };
  const checkAllPendingRef = useRef(checkAllPending);
  checkAllPendingRef.current = checkAllPending;

  // Le serveur signale un mouvement de solde (webhook de Campay, par exemple) : on relit tout de suite l'état des paiements.
  useEffect(() => {
    return wsService.onCashWalletChanged(() => {
      void checkAllPendingRef.current();
      // Un dépôt confirmé peut avoir vérifié un numéro du carnet.
      void loadPhones();
    });
  }, [loadPhones]);

  // Confirmation automatique : intervalle et nombre d'essais réglés dans katika (registre).
  useEffect(() => {
    setAutoStopped(false);
    if (!hasPending) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const delayMs = getPublicParamNumber('cashAutoVerifySeconds') * 1000;
    const maxAttempts = getPublicParamNumber('cashAutoVerifyMaxAttempts');
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      await checkAllPendingRef.current();
      if (cancelled) return;
      if (attempts >= maxAttempts) {
        setAutoStopped(true);
        return;
      }
      timer = setTimeout(tick, delayMs);
    };
    timer = setTimeout(tick, delayMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [hasPending, pendingDeposit?.id]);

  // Délai avant d'afficher la vérification manuelle.
  useEffect(() => {
    if (!hasPending) {
      setShowManualVerify(false);
      return;
    }
    setShowManualVerify(false);
    const timer = setTimeout(() => setShowManualVerify(true), getPublicParamNumber('cashManualVerifyDelaySeconds') * 1000);
    return () => clearTimeout(timer);
  }, [hasPending]);

  const handleVerifyListed = async (id: string) => {
    setVerifyingListedId(id);
    setMessage(null);
    try {
      const status = await verifyCampayDeposit(id);
      if (status.state === 'SUCCESS') {
        if (status.wallet) {
          setWallet(status.wallet);
        } else {
          await loadWallet();
        }
        setMessage({ type: 'success', text: 'Paiement confirmé : ton solde de test est crédité.' });
      } else if (status.state === 'FAILED') {
        setMessage({ type: 'error', text: status.message || 'Le paiement a échoué.' });
      } else {
        setMessage({ type: 'info', text: status.message || 'Paiement toujours en attente.' });
      }
      await loadListedPending();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Vérification impossible.' });
    } finally {
      setVerifyingListedId(null);
    }
  };

  /** Le joueur abandonne l'attente d'un paiement resté sans réponse : il reste à vérifier dans la liste. */
  const startAnotherDeposit = () => {
    setPendingDeposit(null);
    setMessage(null);
    void loadListedPending();
  };

  return {
    selectedQuick,
    setSelectedQuick,
    typed,
    setTyped,
    depositing,
    message,
    setMessage,
    phone,
    setPhone,
    pendingDeposit,
    verifying,
    listedPending,
    verifyingListedId,
    showManualVerify,
    autoStopped,
    dismissPending,
    handleDeposit,
    handleVerify,
    handleVerifyListed,
    startAnotherDeposit,
  };
}

export type KoraCashDepositsState = ReturnType<typeof useKoraCashDeposits>;
