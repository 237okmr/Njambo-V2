import React, { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert, Users } from 'lucide-react';
import { CashTablesView, acceptCashTableTerms } from '../services/koraCashClient';
import { formatFcfa, parseTypedAmount } from '../services/koraCashFormat';

export interface CashTableRequest {
  betLevel?: number;
  capacity?: number;
  buyIn: number;
  isPublic?: boolean;
  roomCode?: string;
}

type TableMode = 'public' | 'private' | 'code';

const MODES: { id: TableMode; label: string }[] = [
  { id: 'public', label: 'Salon public' },
  { id: 'private', label: 'Table privée' },
  { id: 'code', label: 'J’ai un code' },
];

interface KoraCashTablesPanelProps {
  view: CashTablesView;
  available: number;
  onViewChange: (next: CashTablesView) => void;
  onOpenTable: (request: CashTableRequest) => Promise<{ success: boolean; error?: string }>;
  onResumeTable: (roomCode: string) => void;
  onGoToDeposit: () => void;
  /** Arrivée depuis une invitation devenue impossible : table publique de la même mise, déjà choisie. */
  initialPublic?: { bet: number; capacity: number } | null;
}

const chipClass = (active: boolean) =>
  `min-h-9 px-2.5 rounded-lg text-xs font-bold border cursor-pointer disabled:opacity-50 ${
    active ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-amber-500/50'
  }`;

/** Choix d'une table Cash : le serveur reste seul juge des niveaux, des bornes et du solde. */
export const KoraCashTablesPanel: React.FC<KoraCashTablesPanelProps> = ({ view, available, onViewChange, onOpenTable, onResumeTable, onGoToDeposit, initialPublic }) => {
  const [mode, setMode] = useState<TableMode>('public');
  const [bet, setBet] = useState<number>(initialPublic && view.betLevels.includes(initialPublic.bet) ? initialPublic.bet : (view.betLevels[0] ?? 0));
  const [capacity, setCapacity] = useState<number>(initialPublic ? initialPublic.capacity : 2);
  const [typed, setTyped] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [ticked, setTicked] = useState<boolean>(false);

  const range = useMemo(() => ({ min: bet * view.minBuyInMultiple, max: bet * view.maxBuyInMultiple }), [bet, view.minBuyInMultiple, view.maxBuyInMultiple]);
  const canAffordLevel = available >= range.min;

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
    const limits = mode === 'code' ? { min: 1 } : { min: range.min, max: range.max };
    const parsed = parseTypedAmount(typed, limits);
    if (!parsed.ok || parsed.amount === undefined) {
      setError(parsed.error || 'Montant invalide.');
      return;
    }
    if (mode === 'code' && code.trim().length === 0) {
      setError('Saisis le code de la table.');
      return;
    }
    setBusy(true);
    try {
      const result = await onOpenTable(
        mode === 'code'
          ? { roomCode: code.trim().toUpperCase(), buyIn: parsed.amount }
          : { betLevel: bet, capacity, isPublic: mode === 'public', buyIn: parsed.amount }
      );
      if (!result.success) setError(result.error || 'Entrée à la table impossible.');
    } finally {
      setBusy(false);
    }
  };

  if (view.myTableCode) {
    return (
      <div className="flex flex-col gap-2.5 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
        <p className="text-xs text-slate-200 leading-relaxed">Tu as une table en cours. Ton capital y reste tant que tu n’en sors pas.</p>
        <button
          type="button"
          onClick={() => onResumeTable(view.myTableCode as string)}
          className="w-full h-10 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-slate-950 font-black text-xs cursor-pointer"
        >
          Retourner à ma table
        </button>
      </div>
    );
  }

  if (!view.consented) {
    return (
      <div className="flex flex-col gap-2.5 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
        <span className="text-xs font-black text-slate-200">Avant ta première table</span>
        <p className="text-xs text-slate-300 leading-relaxed">
          À une table Kora Cash, tu joues l’argent de ton solde contre d’autres joueurs. Tu peux le perdre. Une commission de {view.rakePercent} % est prélevée sur chaque pot gagné.
        </p>
        <label className="flex items-start gap-2 text-xs text-slate-200 cursor-pointer">
          <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-500 shrink-0" />
          <span>J’ai 18 ans ou plus et je sais que je joue de l’argent réel.</span>
        </label>
        <button
          type="button"
          disabled={!ticked || busy}
          onClick={() => void accept()}
          className="w-full h-10 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>Confirmer</span>
        </button>
        {error && <p className="text-xs font-bold text-rose-300">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
      <div role="radiogroup" aria-label="Type de table" className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => { setMode(m.id); setError(null); }} className={chipClass(mode === m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'code' ? (
        <input
          type="text"
          autoComplete="off"
          maxLength={8}
          value={code}
          disabled={busy}
          onChange={(e) => { setCode(e.target.value); setError(null); }}
          placeholder="Code de la table"
          aria-label="Code de la table"
          className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-400 outline-none text-xs text-white placeholder:text-slate-500 uppercase"
        />
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-black text-slate-200">Mise par partie</span>
            <div className="flex flex-wrap gap-1.5">
              {view.betLevels.map((level) => (
                <button key={level} type="button" aria-pressed={bet === level} onClick={() => { setBet(level); setError(null); }} className={chipClass(bet === level)}>
                  {formatFcfa(level)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-black text-slate-200 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              Joueurs
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[2, 3, 4].map((n) => (
                <button key={n} type="button" aria-pressed={capacity === n} onClick={() => setCapacity(n)} className={chipClass(capacity === n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-black text-slate-200">Somme que tu apportes</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={typed}
          disabled={busy}
          onChange={(e) => { setTyped(e.target.value); setError(null); }}
          placeholder={mode === 'code' ? 'Montant en FCFA' : `De ${range.min} à ${range.max} FCFA`}
          aria-label="Somme que tu apportes, en FCFA"
          className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-400 outline-none text-xs text-white placeholder:text-slate-500"
        />
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Commission : {view.rakePercent} % de chaque pot gagné. Tu sors quand tu veux entre deux parties, avec tout ton capital. Partir pendant une partie vaut forfait. Tables entre joueurs uniquement, sans bots.
      </p>

      {mode !== 'code' && !canAffordLevel && (
        <p className="flex items-start gap-2 text-xs font-bold text-amber-200">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>
            Il te faut au moins {formatFcfa(range.min)} pour cette mise. Ton solde disponible : {formatFcfa(available)}.{' '}
            <button type="button" onClick={onGoToDeposit} className="underline underline-offset-2 cursor-pointer">
              Déposer
            </button>
          </span>
        </p>
      )}

      <button
        type="button"
        disabled={busy || (mode !== 'code' && !canAffordLevel)}
        onClick={() => void submit()}
        className="w-full h-10 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        <span>Prendre place</span>
      </button>

      {error && <p className="text-xs font-bold text-rose-300">{error}</p>}
    </div>
  );
};
