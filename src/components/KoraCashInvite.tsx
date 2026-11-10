import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert, Users } from 'lucide-react';
import { CashTablePreviewView, CashTablesView, acceptCashTableTerms, fetchCashTablePreview } from '../services/koraCashClient';
import { formatFcfa, parseTypedAmount } from '../services/koraCashFormat';
import type { CashTableRequest } from './KoraCashTablesPanel';

interface KoraCashInviteProps {
  code: string;
  /** Réglages et confirmation 18 ans du joueur ; null tant qu'ils ne sont pas lus. */
  view: CashTablesView | null;
  /** Vrai quand la lecture de ces réglages est terminée (réussie ou non). */
  viewChecked: boolean;
  available: number;
  onViewChange: (next: CashTablesView) => void;
  onJoin: (request: CashTableRequest) => Promise<{ success: boolean; error?: string }>;
  onResume: (roomCode: string) => void;
  onGoToDeposit: () => void;
  /** Table pleine, commencée ou terminée : jouer à une table publique de la même mise. */
  onPublicTable: (bet: number, capacity: number) => void;
  onDismiss: () => void;
}

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'closed' } | { kind: 'ready'; preview: CashTablePreviewView };

const primaryButton =
  'w-full h-10 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50';
const secondaryButton = 'w-full h-10 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 font-bold text-xs cursor-pointer hover:border-amber-500/50';

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 py-1.5">
    <dt className="text-xs text-slate-400">{label}</dt>
    <dd className="text-xs font-bold text-slate-100 text-right">{value}</dd>
  </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div id="kora-cash-invite" className="flex flex-col gap-3 p-3 rounded-2xl bg-slate-950/60 border border-amber-500/30">
    <span className="text-sm font-black text-white">{title}</span>
    {children}
  </div>
);

/** Page d'une invitation à une table Kora Cash : le serveur montre la table, puis reste seul juge de l'entrée. */
export const KoraCashInvite: React.FC<KoraCashInviteProps> = ({ code, view, viewChecked, available, onViewChange, onJoin, onResume, onGoToDeposit, onPublicTable, onDismiss }) => {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState<number>(0);
  const [typed, setTyped] = useState<string>('');
  const [ticked, setTicked] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: 'loading' });
    setError(null);
    fetchCashTablePreview(code)
      .then((result) => {
        if (cancelled) return;
        if (!result.enabled || !result.preview) {
          setLoad({ kind: 'closed' });
          return;
        }
        setTyped(result.preview.minBuyIn !== undefined ? String(result.preview.minBuyIn) : '');
        setLoad({ kind: 'ready', preview: result.preview });
      })
      .catch((err) => {
        if (!cancelled) setLoad({ kind: 'error', message: err instanceof Error ? err.message : 'Lecture de la table impossible.' });
      });
    return () => {
      cancelled = true;
    };
  }, [code, attempt]);

  if (viewChecked && !view) {
    return (
      <Card title="Table Kora Cash">
        <p className="text-xs font-bold text-rose-300">Lecture des tables impossible pour le moment.</p>
        <button type="button" onClick={onDismiss} className={secondaryButton}>
          Aller à Kora Cash
        </button>
      </Card>
    );
  }

  if (load.kind === 'loading' || !view) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Lecture de la table…</span>
      </div>
    );
  }

  if (load.kind === 'error') {
    return (
      <Card title="Table Kora Cash">
        <p className="text-xs font-bold text-rose-300">{load.message}</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className={primaryButton}>
          Réessayer
        </button>
        <button type="button" onClick={onDismiss} className={secondaryButton}>
          Aller à Kora Cash
        </button>
      </Card>
    );
  }

  if (load.kind === 'closed' || !view.enabled) {
    return (
      <Card title="Tables fermées pour le moment">
        <p className="text-xs text-slate-300 leading-relaxed">Les tables Kora Cash sont fermées pour le moment. Reviens un peu plus tard.</p>
        <button type="button" onClick={onDismiss} className={secondaryButton}>
          Aller à Kora Cash
        </button>
      </Card>
    );
  }

  const preview = load.preview;

  if (preview.state === 'MINE' && preview.roomCode) {
    return (
      <Card title="Tu es déjà à cette table">
        <p className="text-xs text-slate-300 leading-relaxed">Ton capital y reste tant que tu n’en sors pas.</p>
        <button type="button" onClick={() => onResume(preview.roomCode as string)} className={primaryButton}>
          Retourner à ma table
        </button>
      </Card>
    );
  }

  if (preview.state !== 'OPEN') {
    const reason =
      preview.state === 'FULL'
        ? 'Cette table est complète.'
        : preview.state === 'STARTED'
          ? 'Cette partie a déjà commencé.'
          : preview.state === 'CLOSED'
            ? 'Cette table est terminée.'
            : 'Cette table n’existe pas ou n’est plus ouverte.';
    const level = preview.betLevel !== undefined && view.betLevels.includes(preview.betLevel) ? preview.betLevel : undefined;
    const capacity = preview.capacity !== undefined && preview.capacity >= 2 && preview.capacity <= 4 ? preview.capacity : 2;
    return (
      <Card title={reason}>
        {level !== undefined && (
          <>
            <button type="button" onClick={() => onPublicTable(level, capacity)} className={primaryButton}>
              Jouer à une table publique de {formatFcfa(level)}
            </button>
            <p className="text-xs text-slate-400 leading-relaxed">Tu rejoins une table ouverte à cette mise, ou tu en ouvres une et tu attends d’autres joueurs.</p>
          </>
        )}
        <button type="button" onClick={onDismiss} className={secondaryButton}>
          Aller à Kora Cash
        </button>
      </Card>
    );
  }

  const min = preview.minBuyIn ?? 0;
  const max = preview.maxBuyIn;
  const bet = preview.bet ?? 0;
  const capacity = preview.capacity ?? 2;
  const seated = preview.seated ?? 0;

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptCashTableTerms();
      onViewChange({ ...view, consented: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError(null);
    const parsed = parseTypedAmount(typed, { min, max });
    if (!parsed.ok || parsed.amount === undefined) {
      setError(parsed.error || 'Montant invalide.');
      return;
    }
    if (parsed.amount > available) {
      setError(`Ton solde disponible est de ${formatFcfa(available)}.`);
      return;
    }
    setBusy(true);
    try {
      const result = await onJoin({ roomCode: code, buyIn: parsed.amount });
      if (!result.success) setError(result.error || 'Entrée à la table impossible.');
    } finally {
      setBusy(false);
    }
  };

  const canAffordMin = available >= min;

  return (
    <Card title="Invitation à une table Kora Cash">
      <dl className="divide-y divide-slate-800/80">
        {preview.hostName && <Row label="Hôte" value={preview.hostName} />}
        <Row label="Mise" value={formatFcfa(bet)} />
        <Row label="Commission" value={`${preview.rakePercent ?? view.rakePercent} % du pot gagné`} />
        <Row label="Places" value={`${seated} sur ${capacity} prises`} />
        <Row label="Entrée à la table" value={max !== undefined ? `${formatFcfa(min)} à ${formatFcfa(max)}` : `À partir de ${formatFcfa(min)}`} />
        <Row label="Mon solde disponible" value={formatFcfa(available)} />
      </dl>

      {!view.consented && (
        <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-slate-800">
          <span className="text-xs font-black text-slate-200">Avant ta première table</span>
          <p className="text-xs text-slate-300 leading-relaxed">
            À une table Kora Cash, tu joues l’argent de ton solde contre d’autres joueurs. Tu peux le perdre. Une commission de {view.rakePercent} % est prélevée sur chaque pot gagné.
          </p>
          <label className="flex items-start gap-2 text-xs text-slate-200 cursor-pointer">
            <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-500 shrink-0" />
            <span>J’ai 18 ans ou plus et je sais que je joue de l’argent réel.</span>
          </label>
          <button type="button" disabled={!ticked || busy} onClick={() => void accept()} className={primaryButton}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>Confirmer</span>
          </button>
        </div>
      )}

      {view.consented && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-slate-300">Ton entrée à la table (FCFA)</span>
            <input
              type="text"
              inputMode="numeric"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                setError(null);
              }}
              aria-label="Montant de ton entrée à la table"
              className="h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold focus:border-amber-500 outline-none"
            />
          </label>

          {!canAffordMin && (
            <p className="flex items-start gap-2 text-xs font-bold text-amber-200">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                Il te faut au moins {formatFcfa(min)} pour t’asseoir ici. Ton solde disponible : {formatFcfa(available)}.{' '}
                <button type="button" onClick={onGoToDeposit} className="underline underline-offset-2 cursor-pointer">
                  Déposer
                </button>
              </span>
            </p>
          )}

          <button type="button" disabled={busy || !canAffordMin} onClick={() => void submit()} className={primaryButton}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>Prendre place</span>
          </button>
        </>
      )}

      {error && <p className="text-xs font-bold text-rose-300">{error}</p>}

      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Users className="w-3.5 h-3.5 shrink-0" />
        <span>Argent réel, réservé aux 18 ans et plus. Tu peux perdre ta mise.</span>
      </p>
      <button type="button" onClick={onDismiss} className={secondaryButton}>
        Plus tard
      </button>
    </Card>
  );
};
