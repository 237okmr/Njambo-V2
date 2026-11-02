import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Wallet, X, Loader2, Lock, Coins, ShieldAlert, CheckCircle2, Clock } from 'lucide-react';
import { usePlayerProfile } from '../context/PlayerProfileContext';
import { GoogleIcon } from './common/GoogleIcon';
import {
  startCampayDeposit,
  verifyCampayDeposit,
  fetchPendingDeposits,
  fetchPhones,
  fetchWithdrawalSettings,
  fetchCashTables,
  CashPhone,
  CashTablesView,
  KoraCashWallet,
  PendingDeposit,
  WithdrawalSettingsView,
} from '../services/koraCashClient';
import { KoraCashPhonesPanel, KoraCashWithdrawPanel } from './KoraCashWithdrawPanels';
import { CashTableRequest, KoraCashTablesPanel } from './KoraCashTablesPanel';
import { refreshKoraCashWallet, setKoraCashWallet, useKoraCashWallet } from '../services/koraCashWalletStore';
import { wsService } from '../services/websocketService';
import { getPublicParamNumber } from '../services/publicConfig';
import {
  KoraCashDepositMode,
  KoraCashEnvironment,
  formatFcfa,
  formatPhone,
  getDepositUi,
  parseTypedAmount,
} from '../services/koraCashFormat';

interface KoraCashModalProps {
  environment: KoraCashEnvironment;
  depositMode?: KoraCashDepositMode;
  onClose: () => void;
  onOpenCashTable?: (request: CashTableRequest) => Promise<{ success: boolean; error?: string }>;
  onResumeCashTable?: (roomCode: string) => void;
}

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

export const KoraCashModal: React.FC<KoraCashModalProps> = ({ environment, depositMode = 'SIMULATED', onClose, onOpenCashTable, onResumeCashTable }) => {
  const { isLoggedIn, loginWithGoogle } = usePlayerProfile();
  // Retrait : les onglets n'apparaissent que si le serveur dit qu'il est ouvert.
  const [withdrawalSettings, setWithdrawalSettings] = useState<WithdrawalSettingsView | null>(null);
  const [phones, setPhones] = useState<CashPhone[]>([]);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'phones' | 'tables'>('deposit');
  const [cashTables, setCashTables] = useState<CashTablesView | null>(null);
  const canWithdraw = withdrawalSettings?.enabled === true;
  const canPlayTables = cashTables?.enabled === true && Boolean(onOpenCashTable) && Boolean(onResumeCashTable);
  const tabs: readonly (readonly ['deposit' | 'withdraw' | 'phones' | 'tables', string])[] = [
    ['deposit', 'Déposer'],
    ...(canWithdraw ? ([['withdraw', 'Retirer'], ['phones', canPlayTables ? 'Numéros' : 'Mes numéros']] as const) : []),
    ...(canPlayTables ? ([['tables', 'Tables']] as const) : []),
  ];
  const hasTabs = tabs.length > 1;
  const ui = getDepositUi(environment, depositMode, canWithdraw);

  const loadPhones = useCallback(async () => {
    try {
      setPhones(await fetchPhones());
    } catch {
      setPhones([]);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    fetchWithdrawalSettings()
      .then((settings) => {
        if (!cancelled) setWithdrawalSettings(settings);
      })
      .catch(() => {
        if (!cancelled) setWithdrawalSettings(null);
      });
    fetchCashTables()
      .then((view) => {
        if (!cancelled) setCashTables(view);
      })
      .catch(() => {
        if (!cancelled) setCashTables(null);
      });
    void loadPhones();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, loadPhones]);

  // Solde partagé avec l'accueil, mis à jour en direct quand le serveur signale un mouvement.
  const walletState = useKoraCashWallet(isLoggedIn);
  const wallet = walletState.wallet;
  const loadingWallet = walletState.loading;
  const walletError = walletState.error;
  const loadWallet = useCallback(() => refreshKoraCashWallet(), []);
  const setWallet = (next: KoraCashWallet) => setKoraCashWallet(next);
  const [selectedQuick, setSelectedQuick] = useState<number | null>(null);
  const [typed, setTyped] = useState<string>('');
  const [depositing, setDepositing] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [phone, setPhone] = useState<string>('');
  const [pendingDeposit, setPendingDeposit] = useState<{ id: string; text: string } | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);
  // Dépôts Mobile Money lancés mais pas encore confirmés, retrouvés côté serveur (même après fermeture de la fenêtre).
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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

  const content = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[120] bg-slate-950/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Kora Cash"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Wallet className="w-4.5 h-4.5" />
            </div>
            <h2 className="text-sm font-black text-white truncate">Kora Cash</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-4 flex flex-col gap-3">
          <div
            className={`flex items-start gap-2 px-3 py-2 rounded-xl text-[11px] font-bold border ${
              environment === 'DEMO'
                ? 'bg-amber-500/10 text-amber-200 border-amber-500/30'
                : 'bg-rose-500/10 text-rose-200 border-rose-500/30'
            }`}
          >
            <ShieldAlert className="w-4 h-4 shrink-0 mt-px" />
            <span>{ui.banner}</span>
          </div>

          {!isLoggedIn ? (
            <div className="flex flex-col gap-3 p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
                <Lock className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Kora Cash est réservé aux joueurs connectés avec un compte Google. Connecte-toi pour voir ton solde.
              </p>
              <button
                type="button"
                onClick={loginWithGoogle}
                className="w-full h-10 px-4 rounded-xl bg-gradient-to-r from-white via-slate-100 to-amber-100 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer border border-white/80 active:scale-95"
              >
                <GoogleIcon className="w-4 h-4 shrink-0" />
                <span>Se connecter avec Google</span>
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span>Disponible</span>
                  </div>
                  <div className="mt-1 text-base font-black text-white">
                    {loadingWallet && !wallet ? '…' : formatFcfa(wallet?.available ?? 0)}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span>En table</span>
                  </div>
                  <div className="mt-1 text-base font-black text-white">
                    {loadingWallet && !wallet ? '…' : formatFcfa(wallet?.locked ?? 0)}
                  </div>
                </div>
              </div>

              {walletError && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-200">
                  <span>{walletError}</span>
                  <button type="button" onClick={() => void loadWallet()} className="font-black underline cursor-pointer shrink-0">
                    Réessayer
                  </button>
                </div>
              )}

              {hasTabs && (
                <div
                  role="tablist"
                  aria-label="Kora Cash"
                  className={`grid gap-1 p-1 rounded-xl bg-slate-950/90 border border-slate-800 ${
                    tabs.length === 4 ? 'grid-cols-4' : tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
                  }`}
                >
                  {tabs.map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === id}
                      onClick={() => setActiveTab(id)}
                      className={`h-9 rounded-lg text-xs font-bold cursor-pointer ${activeTab === id ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {canWithdraw && withdrawalSettings && activeTab === 'withdraw' && (
                <KoraCashWithdrawPanel
                  settings={withdrawalSettings}
                  phones={phones}
                  available={wallet?.available ?? 0}
                  onManagePhones={() => setActiveTab('phones')}
                />
              )}

              {canWithdraw && withdrawalSettings && activeTab === 'phones' && (
                <KoraCashPhonesPanel phones={phones} maxPhones={withdrawalSettings.maxPhones} onPhonesChange={setPhones} />
              )}

              {canPlayTables && cashTables && activeTab === 'tables' && onOpenCashTable && onResumeCashTable && (
                <KoraCashTablesPanel
                  view={cashTables}
                  available={wallet?.available ?? 0}
                  onViewChange={setCashTables}
                  onOpenTable={async (request) => {
                    const result = await onOpenCashTable(request);
                    if (result.success) onClose();
                    return result;
                  }}
                  onResumeTable={(roomCode) => {
                    onResumeCashTable(roomCode);
                    onClose();
                  }}
                />
              )}

              {ui.canDeposit && (!hasTabs || activeTab === 'deposit') && (
                <div className="flex flex-col gap-2.5 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] font-black text-slate-200">Montant à recharger</span>
                  <div className="grid grid-cols-4 gap-2">
                    {ui.quickAmounts.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        disabled={depositing}
                        onClick={() => {
                          setSelectedQuick(amount);
                          setTyped('');
                          setMessage(null);
                        }}
                        className={`py-2 rounded-xl text-[11px] font-black border cursor-pointer disabled:opacity-50 ${
                          selectedQuick === amount && typed.trim() === ''
                            ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                            : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-amber-500/50'
                        }`}
                      >
                        {formatFcfa(amount).replace(' FCFA', '')}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={typed}
                    disabled={depositing}
                    onChange={(e) => {
                      setTyped(e.target.value);
                      setSelectedQuick(null);
                      setMessage(null);
                    }}
                    placeholder={ui.maxAmount !== null ? `Autre montant (${ui.minAmount} à ${ui.maxAmount} FCFA)` : 'Autre montant en FCFA'}
                    aria-label="Autre montant en FCFA"
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-400 outline-none text-xs text-white placeholder:text-slate-500"
                  />
                  {ui.needsPhone && phones.length > 0 && (
                    <div className="flex flex-wrap gap-1.5" aria-label="Mes numéros">
                      {phones.map((p) => (
                        <button
                          key={p.phone}
                          type="button"
                          disabled={depositing || pendingDeposit !== null}
                          onClick={() => {
                            setPhone(p.phone);
                            setMessage(null);
                          }}
                          className={`min-h-9 px-2.5 rounded-lg text-xs font-bold border cursor-pointer disabled:opacity-50 ${
                            phone === p.phone ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-slate-900 border-slate-700 text-slate-200'
                          }`}
                        >
                          {formatPhone(p.phone)}
                        </button>
                      ))}
                    </div>
                  )}
                  {ui.needsPhone && (
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      disabled={depositing || pendingDeposit !== null}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setMessage(null);
                      }}
                      placeholder="Ton numéro Mobile Money (ex. 677 12 34 56)"
                      aria-label="Numéro Mobile Money"
                      className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-400 outline-none text-xs text-white placeholder:text-slate-500"
                    />
                  )}
                  <button
                    type="button"
                    disabled={depositing || pendingDeposit !== null}
                    onClick={() => void handleDeposit()}
                    className="w-full h-10 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {depositing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    <span>{ui.buttonLabel}</span>
                  </button>
                  {pendingDeposit && (
                    <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-100">
                      <span className="font-bold flex items-center gap-2">
                        {autoStopped ? <Clock className="w-3.5 h-3.5 shrink-0" /> : <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                        <span>{autoStopped ? 'Toujours en attente chez Campay' : 'Confirmation en cours…'}</span>
                      </span>
                      <span className="text-amber-100/80">
                        {autoStopped
                          ? 'Campay n’a toujours pas reçu de réponse de ton opérateur. Si tu as refusé ou ignoré la demande, rien ne sera crédité. Si tu l’as validée, ton solde se mettra à jour dès que Campay confirme.'
                          : 'Campay attend la réponse de ton opérateur. Si tu as validé la demande sur ton téléphone, ton solde se mettra à jour tout seul.'}
                      </span>
                      {(showManualVerify || autoStopped) && (
                        <button
                          type="button"
                          disabled={verifying}
                          onClick={() => void handleVerify()}
                          className="self-start text-[11px] text-amber-300/80 underline underline-offset-2 cursor-pointer disabled:opacity-60"
                        >
                          {verifying ? 'Vérification…' : 'Ça n’avance pas ? Vérifier maintenant'}
                        </button>
                      )}
                      {(showManualVerify || autoStopped) && (
                        <button
                          type="button"
                          onClick={() => dismissPending(pendingDeposit.id)}
                          className="self-start text-[11px] text-amber-300/80 underline underline-offset-2 cursor-pointer"
                        >
                          J’ai annulé ce paiement
                        </button>
                      )}
                      {autoStopped && (
                        <button
                          type="button"
                          onClick={() => {
                            setPendingDeposit(null);
                            setMessage(null);
                            void loadListedPending();
                          }}
                          className="self-start text-[11px] text-amber-300/80 underline underline-offset-2 cursor-pointer"
                        >
                          Faire un autre dépôt (celui-ci reste à vérifier plus bas)
                        </button>
                      )}
                    </div>
                  )}
                  {listedPending.filter((d) => d.id !== pendingDeposit?.id).length > 0 && (
                    <div className="flex flex-col gap-2 px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700 text-[11px] text-slate-200">
                      <span className="font-bold">Paiements en cours de confirmation</span>
                      {listedPending
                        .filter((d) => d.id !== pendingDeposit?.id)
                        .map((d) => (
                          <div key={d.id} className="flex items-center justify-between gap-2">
                            <span>{formatFcfa(d.amount)}</span>
                            {showManualVerify || autoStopped ? (
                              <span className="flex items-center gap-3">
                                <button
                                  type="button"
                                  disabled={verifyingListedId !== null}
                                  onClick={() => void handleVerifyListed(d.id)}
                                  className="text-[11px] text-amber-300/80 underline underline-offset-2 cursor-pointer disabled:opacity-60"
                                >
                                  {verifyingListedId === d.id ? 'Vérification…' : 'Vérifier maintenant'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => dismissPending(d.id)}
                                  className="text-[11px] text-slate-400 underline underline-offset-2 cursor-pointer"
                                >
                                  J’ai annulé
                                </button>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-slate-400">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Confirmation en cours…</span>
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                  {message && (
                    <div
                      className={`flex items-start gap-2 text-[11px] font-bold ${
                        message.type === 'success' ? 'text-emerald-300' : message.type === 'info' ? 'text-amber-200' : 'text-rose-300'
                      }`}
                    >
                      {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <ShieldAlert className="w-4 h-4 shrink-0" />}
                      <span>{message.text}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );

  return createPortal(content, document.body);
};
