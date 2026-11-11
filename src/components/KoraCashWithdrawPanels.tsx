import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import {
  CashPhone,
  WithdrawalSettingsView,
  WithdrawalView,
  addCashPhone,
  cancelWithdrawal,
  fetchWithdrawals,
  removeCashPhone,
  requestWithdrawal,
  verifyWithdrawal,
} from '../services/koraCashClient';
import { refreshKoraCashWallet } from '../services/koraCashWalletStore';
import { wsService } from '../services/websocketService';
import { getPublicParamNumber } from '../services/publicConfig';
import { formatFcfa, formatPhone, parseTypedAmount, quoteWithdrawal, withdrawalStatusLabel } from '../services/koraCashFormat';

type PanelMessage = { type: 'success' | 'error' | 'info'; text: string } | null;

const MessageLine: React.FC<{ message: PanelMessage }> = ({ message }) =>
  message ? (
    <div
      className={`flex items-start gap-2 text-xs font-bold ${
        message.type === 'success' ? 'text-emerald-300' : message.type === 'info' ? 'text-amber-200' : 'text-rose-300'
      }`}
    >
      {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <ShieldAlert className="w-4 h-4 shrink-0" />}
      <span>{message.text}</span>
    </div>
  ) : null;

const isSending = (status: string) => status === 'READY' || status === 'SENDING' || status === 'PROCESSING';

interface WithdrawPanelProps {
  settings: WithdrawalSettingsView;
  phones: CashPhone[];
  available: number;
  onManagePhones: () => void;
}

/** Onglet Retirer : montant, numéro vérifié, montant net annoncé avant confirmation, puis suivi des demandes. */
export const KoraCashWithdrawPanel: React.FC<WithdrawPanelProps> = ({ settings, phones, available, onManagePhones }) => {
  const verifiedPhones = phones.filter((p) => p.verified);
  const [typed, setTyped] = useState<string>('');
  const [selectedPhone, setSelectedPhone] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<PanelMessage>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalView[]>([]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const phone = selectedPhone && verifiedPhones.some((p) => p.phone === selectedPhone) ? selectedPhone : verifiedPhones[0]?.phone ?? '';
  const amount = /^\d+$/.test(typed.trim()) ? Number(typed.trim()) : null;
  const quote = amount !== null ? quoteWithdrawal(amount, settings.feePercent) : null;

  const load = useCallback(async () => {
    try {
      setWithdrawals(await fetchWithdrawals());
    } catch {
      // la liste se relira à la prochaine action
    }
  }, []);

  useEffect(() => {
    void load();
    return wsService.onCashWalletChanged(() => void load());
  }, [load]);

  // Relecture automatique tant qu'un envoi est en cours : intervalle et nombre d'essais réglés dans katika (registre).
  const sendingIds = withdrawals.filter((w) => isSending(w.status)).map((w) => w.id).join(',');
  const sendingIdsRef = useRef(sendingIds);
  sendingIdsRef.current = sendingIds;
  useEffect(() => {
    if (!sendingIds) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const delayMs = getPublicParamNumber('cashAutoVerifySeconds') * 1000;
    const maxAttempts = getPublicParamNumber('cashAutoVerifyMaxAttempts');
    const tick = async () => {
      attempts += 1;
      for (const id of sendingIdsRef.current.split(',').filter(Boolean)) {
        try {
          await verifyWithdrawal(id);
        } catch {
          // silencieux : prochaine relecture
        }
      }
      if (cancelled) return;
      await load();
      void refreshKoraCashWallet();
      if (!cancelled && attempts < maxAttempts) timer = setTimeout(tick, delayMs);
    };
    timer = setTimeout(tick, delayMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sendingIds, load]);

  const handleSubmit = async () => {
    setMessage(null);
    const parsed = parseTypedAmount(typed, { min: settings.minAmount, max: settings.maxAmount });
    if (!parsed.ok || parsed.amount === undefined) {
      setMessage({ type: 'error', text: (parsed.error || 'Montant invalide.').replace('dépôt', 'retrait') });
      return;
    }
    if (parsed.amount > available) {
      setMessage({ type: 'error', text: 'Ton solde disponible est insuffisant.' });
      return;
    }
    if (!phone) {
      setMessage({ type: 'error', text: 'Aucun numéro vérifié pour recevoir ce retrait.' });
      return;
    }
    setSubmitting(true);
    try {
      const result = await requestWithdrawal(parsed.amount, phone);
      setTyped('');
      setMessage({ type: result.withdrawal.status === 'FAILED' ? 'error' : 'success', text: result.message || withdrawalStatusLabel(result.withdrawal.status) });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'La demande de retrait a échoué.' });
    } finally {
      setSubmitting(false);
      await load();
      void refreshKoraCashWallet();
    }
  };

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    setMessage(null);
    try {
      await cancelWithdrawal(id);
      setMessage({ type: 'success', text: 'Demande annulée : ton argent est de retour sur ton solde.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Annulation impossible.' });
    } finally {
      setCancellingId(null);
      await load();
      void refreshKoraCashWallet();
    }
  };

  return (
    <div className="flex flex-col gap-2.5 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
      {verifiedPhones.length === 0 ? (
        <div className="flex flex-col gap-2 text-xs text-slate-300">
          <p>Pour retirer, il te faut un numéro vérifié : fais un dépôt depuis ce numéro, il s’active tout seul.</p>
          <button type="button" onClick={onManagePhones} className="self-start text-xs font-bold text-amber-300 underline underline-offset-2 cursor-pointer">
            Voir mes numéros
          </button>
        </div>
      ) : (
        <>
          <label className="text-xs font-black text-slate-200" htmlFor="kora-withdraw-amount">
            Montant à retirer
          </label>
          <input
            id="kora-withdraw-amount"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={typed}
            disabled={submitting}
            onChange={(e) => {
              setTyped(e.target.value);
              setMessage(null);
            }}
            placeholder={`${settings.minAmount} à ${settings.maxAmount} FCFA`}
            className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-400 outline-none text-xs text-white placeholder:text-slate-500"
          />
          <span className="text-xs font-black text-slate-200">Vers</span>
          <div className="flex flex-col gap-1.5">
            {verifiedPhones.map((p) => (
              <label key={p.phone} className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                <input type="radio" name="kora-withdraw-phone" checked={phone === p.phone} onChange={() => setSelectedPhone(p.phone)} className="accent-amber-400" />
                <span>{formatPhone(p.phone)}</span>
                {p.operator && <span className="text-slate-400">{p.operator}</span>}
              </label>
            ))}
          </div>
          {quote && quote.net > 0 && (
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
              <dt>Tu demandes</dt>
              <dd className="text-right font-bold">{formatFcfa(amount)}</dd>
              <dt>Frais</dt>
              <dd className="text-right font-bold">{formatFcfa(quote.fee)}</dd>
              <dt className="text-white font-black">Tu reçois</dt>
              <dd className="text-right text-white font-black">{formatFcfa(quote.net)}</dd>
            </dl>
          )}
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="w-full h-10 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>Retirer</span>
          </button>
        </>
      )}

      <MessageLine message={message} />

      {withdrawals.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800">
          <span className="text-xs font-black text-slate-200">Mes demandes</span>
          {withdrawals.map((w) => (
            <div key={w.id} className="flex flex-col gap-0.5 text-xs text-slate-300">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-white">{formatFcfa(w.net)}</span>
                <span className="flex items-center gap-1.5 text-right">
                  {isSending(w.status) ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : w.status === 'REVIEW' || w.status === 'AWAITING_APPROVAL' ? <Clock className="w-3.5 h-3.5 shrink-0" /> : null}
                  <span>{withdrawalStatusLabel(w.status)}</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-slate-400">
                <span>{w.phone}</span>
                {w.status === 'AWAITING_APPROVAL' && (
                  <button
                    type="button"
                    disabled={cancellingId !== null}
                    onClick={() => void handleCancel(w.id)}
                    className="text-amber-300 underline underline-offset-2 cursor-pointer disabled:opacity-60"
                  >
                    {cancellingId === w.id ? 'Annulation…' : 'Annuler'}
                  </button>
                )}
              </div>
              {w.status === 'REVIEW' && <p className="text-amber-200">Nous vérifions cet envoi avec ton opérateur. Ton argent reste de côté en attendant.</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface PhonesPanelProps {
  phones: CashPhone[];
  maxPhones: number;
  onPhonesChange: (phones: CashPhone[]) => void;
}

/** Onglet Mes numéros : ajout et retrait du carnet. Un numéro s'active par un dépôt réussi depuis ce numéro. */
export const KoraCashPhonesPanel: React.FC<PhonesPanelProps> = ({ phones, maxPhones, onPhonesChange }) => {
  const [typed, setTyped] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [message, setMessage] = useState<PanelMessage>(null);

  const handleAdd = async () => {
    setBusy(true);
    setMessage(null);
    try {
      onPhonesChange(await addCashPhone(typed));
      setTyped('');
      setMessage({ type: 'info', text: 'Numéro ajouté. Fais un dépôt depuis ce numéro pour l’activer.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Ajout du numéro impossible.' });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (phone: string) => {
    setBusy(true);
    setMessage(null);
    try {
      onPhonesChange(await removeCashPhone(phone));
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Suppression du numéro impossible.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
      <span className="text-xs font-black text-slate-200">
        Mes numéros ({phones.length}/{maxPhones})
      </span>
      {phones.length === 0 && <p className="text-xs text-slate-400">Aucun numéro enregistré pour le moment.</p>}
      {phones.map((p) => (
        <div key={p.phone} className="flex items-center justify-between gap-2 text-xs text-slate-200">
          <span className="min-w-0">
            <span className="font-bold">{formatPhone(p.phone)}</span>
            {p.operator && <span className="text-slate-400"> · {p.operator}</span>}
          </span>
          <span className="flex items-center gap-2 shrink-0">
            <span className={p.verified ? 'text-emerald-300 font-bold' : 'text-amber-200'}>{p.verified ? 'Vérifié' : 'À vérifier'}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRemove(p.phone)}
              aria-label={`Retirer le numéro ${formatPhone(p.phone)}`}
              className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </span>
        </div>
      ))}
      {phones.length < maxPhones && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={typed}
            disabled={busy}
            onChange={(e) => {
              setTyped(e.target.value);
              setMessage(null);
            }}
            placeholder="Ex. 677 12 34 56"
            aria-label="Nouveau numéro MTN ou Orange"
            className="min-w-0 flex-1 h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-400 outline-none text-xs text-white placeholder:text-slate-500"
          />
          <button
            type="button"
            disabled={busy || typed.trim() === ''}
            onClick={() => void handleAdd()}
            className="h-10 px-3 shrink-0 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      )}
      <p className="text-xs text-slate-400">Un numéro devient vérifié quand un dépôt réussit depuis ce numéro. Seul un numéro vérifié peut recevoir un retrait, et il n’appartient qu’à un seul compte.</p>
      <MessageLine message={message} />
    </div>
  );
};
