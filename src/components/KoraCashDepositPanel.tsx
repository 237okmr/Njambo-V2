import React from 'react';
import { CheckCircle2, Clock, Loader2, ShieldAlert } from 'lucide-react';
import { CashPhone } from '../services/koraCashClient';
import { DepositUi, formatFcfa, formatPhone } from '../services/koraCashFormat';
import { KoraCashDepositsState } from '../hooks/useKoraCashDeposits';

interface KoraCashDepositPanelProps {
  ui: DepositUi;
  phones: CashPhone[];
  deposits: KoraCashDepositsState;
}

/** Onglet Portefeuille, partie Déposer : l'état et le suivi des paiements sont portés par la page. */
export const KoraCashDepositPanel: React.FC<KoraCashDepositPanelProps> = ({ ui, phones, deposits }) => {
  const {
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
  } = deposits;

  return (
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
              onClick={startAnotherDeposit}
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
  );
};
