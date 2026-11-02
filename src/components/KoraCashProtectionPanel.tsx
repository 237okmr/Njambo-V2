import React, { useCallback, useEffect, useState } from 'react';
import { HeartPulse, Loader2 } from 'lucide-react';
import { CashProtectionView, fetchCashProtection, startCashExclusion, updateCashLimit } from '../services/koraCashClient';
import { formatFcfa, parseTypedAmount } from '../services/koraCashFormat';

type LimitKind = 'deposit' | 'loss';

const LIMITS: { kind: LimitKind; title: string; spent: (view: CashProtectionView) => number; spentLabel: string }[] = [
  { kind: 'deposit', title: 'Dépôts par jour', spent: (view) => view.today.deposits, spentLabel: 'déposés aujourd’hui' },
  { kind: 'loss', title: 'Pertes par jour', spent: (view) => view.today.losses, spentLabel: 'perdus aujourd’hui' },
];

const PAUSES: { days: number; label: string }[] = [
  { days: 1, label: '24 heures' },
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
];

const formatDate = (ms: number) => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

type Choice = { kind: 'PAUSE'; days: number; label: string } | { kind: 'PERMANENT'; label: string };

/** Limites personnelles et pauses du joueur. Le serveur applique les règles : baisser agit aussitôt, remonter attend un délai. */
export const KoraCashProtectionPanel: React.FC = () => {
  const [view, setView] = useState<CashProtectionView | null>(null);
  const [typed, setTyped] = useState<Record<LimitKind, string>>({ deposit: '', loss: '' });
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await fetchCashProtection());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lecture de tes limites impossible.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveLimit = async (kind: LimitKind) => {
    const parsed = parseTypedAmount(typed[kind], { min: 1 });
    if (!parsed.ok || parsed.amount === undefined) {
      setError(parsed.error || 'Montant invalide.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await updateCashLimit(kind, parsed.amount);
      setView(result.protection);
      setTyped((t) => ({ ...t, [kind]: '' }));
      setNotice(result.delayed ? `Limite remontée : elle s’appliquera dans ${result.protection.raiseDelayHours} heures.` : 'Nouvelle limite appliquée.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Changement de limite impossible.');
    } finally {
      setBusy(false);
    }
  };

  const confirmExclusion = async () => {
    if (!choice) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setView(await startCashExclusion(choice.kind, choice.kind === 'PAUSE' ? choice.days : undefined));
      setChoice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pause impossible pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  if (!view) {
    return error ? (
      <section className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 text-sm text-rose-300">{error}</section>
    ) : (
      <section className="flex items-center gap-2 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 text-sm text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Chargement de tes limites…</span>
      </section>
    );
  }

  return (
    <section id="kora-cash-protection" className="flex flex-col gap-3 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
      <h3 className="flex items-center gap-2 text-sm font-black text-slate-200">
        <HeartPulse className="w-4 h-4 text-amber-400" />
        Jeu responsable
      </h3>

      {LIMITS.map(({ kind, title, spent, spentLabel }) => {
        const limit = view[kind];
        return (
          <div key={kind} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-bold text-slate-200">{title}</span>
              <span className="text-sm font-black text-white">{formatFcfa(limit.effective)}</span>
            </div>
            <p className="text-xs text-slate-400">
              {formatFcfa(spent(view))} {spentLabel}.
              {limit.pending && ` Passera à ${limit.pending.value === null ? formatFcfa(limit.ceiling) : formatFcfa(limit.pending.value)} le ${formatDate(limit.pending.effectiveAt)}.`}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={typed[kind]}
                disabled={busy}
                onChange={(e) => {
                  setTyped((t) => ({ ...t, [kind]: e.target.value }));
                  setError(null);
                }}
                placeholder={`Jusqu’à ${limit.ceiling} FCFA`}
                aria-label={`${title}, nouvelle limite en FCFA`}
                className="min-w-0 flex-1 min-h-11 px-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-400 outline-none text-sm text-white placeholder:text-slate-500"
              />
              <button
                type="button"
                disabled={busy || typed[kind].trim() === ''}
                onClick={() => void saveLimit(kind)}
                className="min-h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-bold text-sm cursor-pointer disabled:opacity-50 shrink-0"
              >
                Changer
              </button>
            </div>
          </div>
        );
      })}

      <p className="text-xs text-slate-400 leading-relaxed">Baisser une limite agit tout de suite. La remonter ne s’applique qu’après {view.raiseDelayHours} heures.</p>

      <div className="flex flex-col gap-2 pt-3 border-t border-slate-800">
        <span className="text-sm font-bold text-slate-200">Faire une pause</span>
        {view.exclusion && (
          <p id="kora-cash-exclusion-status" className="px-3 py-2 rounded-xl text-sm font-bold bg-amber-500/10 border border-amber-500/30 text-amber-200">
            {view.exclusion.kind === 'PERMANENT' || view.exclusion.until === null
              ? 'Tu t’es exclu de Kora Cash. Dépôts et tables sont fermés.'
              : `Pause en cours jusqu’au ${formatDate(view.exclusion.until)}. Dépôts et tables sont fermés.`}{' '}
            Tu peux toujours retirer ton solde.
          </p>
        )}
        {view.exclusion?.kind !== 'PERMANENT' && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {PAUSES.map((pause) => (
                <button
                  key={pause.days}
                  type="button"
                  disabled={busy}
                  onClick={() => setChoice({ kind: 'PAUSE', days: pause.days, label: `une pause de ${pause.label}` })}
                  className="min-h-11 px-3 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-500/50 text-slate-100 font-bold text-sm cursor-pointer disabled:opacity-50"
                >
                  {pause.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setChoice({ kind: 'PERMANENT', label: 'de t’exclure de Kora Cash, sans date de fin' })}
              className="self-start min-h-11 text-sm text-rose-300 underline underline-offset-2 cursor-pointer disabled:opacity-50"
            >
              M’exclure définitivement
            </button>
          </>
        )}
        {choice && (
          <div id="kora-cash-exclusion-confirm" className="flex flex-col gap-2 p-3 rounded-xl bg-slate-900 border border-amber-500/40">
            <p className="text-sm text-slate-200 leading-relaxed">
              Tu choisis {choice.label}. Tu ne pourras pas l’annuler toi-même. Dépôts et tables seront fermés, le retrait de ton solde reste possible, et le jeu gratuit reste ouvert. Une table déjà commencée peut se terminer.
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void confirmExclusion()} className="flex-1 min-h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm cursor-pointer disabled:opacity-50">
                Confirmer
              </button>
              <button type="button" disabled={busy} onClick={() => setChoice(null)} className="flex-1 min-h-11 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 font-bold text-sm cursor-pointer disabled:opacity-50">
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {notice && <p className="text-sm font-bold text-emerald-300">{notice}</p>}
      {error && <p className="text-sm font-bold text-rose-300">{error}</p>}
    </section>
  );
};
