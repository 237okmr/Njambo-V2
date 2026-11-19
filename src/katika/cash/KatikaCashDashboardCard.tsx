import React, { useCallback, useEffect, useState } from 'react';
import { LayoutDashboard, RotateCw } from 'lucide-react';
import { tikaFetch } from '../services/tikaFetch';

interface Summary {
  depositsGross: number;
  depositFees: number;
  withdrawalsNet: number;
  withdrawalFees: number;
  rake: number;
  operatorWithdrawals: number;
  campayFees: number;
  margin: number;
  kept: number;
}

interface DailyPoint {
  dateKey: string;
  depositsGross: number;
  withdrawalsNet: number;
  rake: number;
  operatorWithdrawals: number;
}

interface OperatorWithdrawal {
  id: string;
  amount: number;
  dateKey: string;
  note: string;
  actor: string;
  createdAt: number;
  cancelledAt?: number;
}

interface Dashboard {
  environment: 'DEMO' | 'LIVE';
  days: number;
  generatedAt: number;
  window: Summary;
  total: Summary;
  daily: DailyPoint[];
  operatorWithdrawals: OperatorWithdrawal[];
}

const PERIODS = [7, 30, 90] as const;

const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
const fmtDay = (dateKey: string) => `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`;
const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
/** Jour courant à Douala (UTC+1, pas d'heure d'été) : borne haute du champ de date. */
// delay-ok: décalage horaire fixe de Douala (UTC+1), pas un délai d'attente
const todayDouala = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

const Tile: React.FC<{ label: string; value: string; hint?: string; tone?: 'amber' | 'emerald' | 'rose' | 'default' }> = ({ label, value, hint, tone = 'default' }) => (
  <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 min-w-0">
    <p className="text-[11px] text-slate-400 leading-snug">{label}</p>
    <p className={`text-sm font-bold mt-0.5 break-words ${tone === 'amber' ? 'text-amber-300' : tone === 'emerald' ? 'text-emerald-300' : tone === 'rose' ? 'text-rose-300' : 'text-slate-100'}`}>{value}</p>
    {hint && <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{hint}</p>}
  </div>
);

/**
 * Tableau de bord Kora Cash : ce que les joueurs ont déposé et retiré, le rake gagné jour par jour, et ce que l'exploitant a déjà sorti de Campay.
 * Les chiffres viennent des totaux tenus au fil de l'eau (31 à 90 lectures au plus). L'environnement affiché est celui de Kora Cash.
 * Aucun minuteur : la carte se recharge à l'ouverture, au retour sur l'onglet du navigateur et au clic sur « Actualiser ».
 */
export const KatikaCashDashboardCard: React.FC = () => {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [dateKey, setDateKey] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const load = useCallback(async (period: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await tikaFetch(`/api/katika/cash/dashboard?days=${period}`);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Lecture impossible.');
      setData(body as Dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lecture impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [load, days]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(days);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load, days]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    const value = Number(amount.replace(/\s/g, ''));
    if (!Number.isInteger(value) || value <= 0) {
      setFormError('Entre un montant entier en FCFA, supérieur à zéro.');
      return;
    }
    setBusy(true);
    try {
      const res = await tikaFetch('/api/katika/cash/operator-withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: value, ...(dateKey ? { dateKey } : {}), note }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Enregistrement impossible.');
      setAmount('');
      setDateKey('');
      setNote('');
      setNotice('Retrait enregistré.');
      await load(days);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      const res = await tikaFetch(`/api/katika/cash/operator-withdrawals/${id}/cancel`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Annulation impossible.');
      setConfirmCancelId(null);
      setNotice('Retrait annulé : les totaux sont corrigés.');
      await load(days);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Annulation impossible.');
    } finally {
      setBusy(false);
    }
  };

  const maxRake = data ? Math.max(0, ...data.daily.map((d) => d.rake)) : 0;
  const w = data?.window;

  return (
    <div className="p-4 sm:p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 flex-wrap">
            <LayoutDashboard className="w-4 h-4 text-amber-400 shrink-0" />
            Tableau de bord
            {data && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${data.environment === 'LIVE' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-sky-500/15 text-sky-300 border-sky-500/30'}`}>
                {data.environment === 'LIVE' ? 'Live' : 'Démo Campay'}
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Ce que les joueurs ont déposé et retiré, la commission des tables (le rake) et ce que tu as déjà sorti de Campay. Sans ouvrir Campay.
          </p>
          {data && <p className="text-[11px] text-slate-500 mt-1">Mis à jour à {fmtTime(data.generatedAt)}</p>}
        </div>
        <button
          type="button"
          onClick={() => void load(days)}
          disabled={loading}
          className="flex items-center gap-1 px-2.5 min-h-11 sm:min-h-0 sm:py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RotateCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualiser</span>
        </button>
      </div>

      <div className="flex gap-1.5" role="group" aria-label="Période">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setDays(p)}
            className={`flex-1 sm:flex-none min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border transition-colors ${days === p ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'}`}
          >
            {p} jours
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-rose-300">{error}</p>}

      {w && data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            <Tile label={`Déposé par les joueurs (${data.days} j)`} value={fmt(w.depositsGross)} />
            <Tile label={`Retiré par les joueurs (${data.days} j)`} value={fmt(w.withdrawalsNet)} />
            <Tile label="Rake gagné" value={fmt(w.rake)} tone="amber" hint="Commission des tables" />
            <Tile label="Gain total" value={fmt(w.margin)} hint="Rake + frais pris aux joueurs − frais Campay estimés" />
            <Tile label="Déjà retiré par toi" value={fmt(w.operatorWithdrawals)} />
            <Tile label="Il te reste" value={fmt(w.kept)} tone={w.kept < 0 ? 'rose' : 'emerald'} hint={w.kept < 0 ? 'Tu as retiré plus que tu n\'as gagné' : 'Gain total − tes retraits'} />
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Depuis le début : rake {fmt(data.total.rake)} · gain total {fmt(data.total.margin)} · retiré par toi {fmt(data.total.operatorWithdrawals)} · il te reste {fmt(data.total.kept)}.
          </p>

          <div>
            <p className="text-xs font-semibold text-slate-300 mb-2">Rake par jour</p>
            {maxRake === 0 ? (
              <p className="text-xs text-slate-500">Aucune commission sur cette période.</p>
            ) : (
              <>
                <div className="flex items-end gap-px h-24" role="img" aria-label={`Rake par jour sur ${data.days} jours, maximum ${fmt(maxRake)}`}>
                  {data.daily.map((d) => (
                    <div key={d.dateKey} className="flex-1 min-w-0 h-full flex items-end" title={`${fmtDay(d.dateKey)} : ${fmt(d.rake)}`}>
                      <div className="w-full rounded-t bg-amber-500/80" style={{ height: `${Math.max(d.rake > 0 ? 4 : 0, (d.rake / maxRake) * 100)}%` }} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>{fmtDay(data.daily[0].dateKey)}</span>
                  <span>Maximum : {fmt(maxRake)}</span>
                  <span>{fmtDay(data.daily[data.daily.length - 1].dateKey)}</span>
                </div>
              </>
            )}
          </div>

          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-300">Mes retraits Campay</p>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                Note ici l'argent que tu sors de Campay pour toi. Il est déduit de « Il te reste » et du rapprochement, qui ne signalera donc plus d'écart à cause de lui. Chaque saisie garde ton nom et l'heure.
              </p>
            </div>
            <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_9rem_1fr_auto] items-end">
              <label className="text-[11px] text-slate-400 space-y-1 block">
                <span>Montant (FCFA)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="ex. 50000"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-base sm:text-xs"
                />
              </label>
              <label className="text-[11px] text-slate-400 space-y-1 block">
                <span>Date (aujourd'hui si vide)</span>
                <input
                  type="date"
                  value={dateKey}
                  max={todayDouala()}
                  onChange={(e) => setDateKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-base sm:text-xs"
                />
              </label>
              <label className="text-[11px] text-slate-400 space-y-1 block">
                <span>Note (facultatif)</span>
                <input
                  type="text"
                  value={note}
                  maxLength={140}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ex. loyer, salaire"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-base sm:text-xs"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="min-h-11 sm:min-h-0 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                Enregistrer
              </button>
            </form>
            {formError && <p className="text-xs text-rose-300">{formError}</p>}
            {notice && <p className="text-xs text-emerald-300">{notice}</p>}

            {data.operatorWithdrawals.length === 0 ? (
              <p className="text-xs text-slate-500">Aucun retrait noté pour le moment.</p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {data.operatorWithdrawals.map((o) => (
                  <li key={o.id} className={`p-3 rounded-lg border text-xs ${o.cancelledAt ? 'bg-slate-900/40 border-slate-800 text-slate-500' : 'bg-slate-900/70 border-slate-800 text-slate-200'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`font-bold ${o.cancelledAt ? 'line-through' : ''}`}>{fmt(o.amount)}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 break-words">
                          {fmtDay(o.dateKey)}
                          {o.note ? ` · ${o.note}` : ''}
                          {o.cancelledAt ? ' · annulé' : ''}
                        </p>
                      </div>
                      {!o.cancelledAt &&
                        (confirmCancelId === o.id ? (
                          <div className="flex gap-1.5 shrink-0">
                            <button type="button" disabled={busy} onClick={() => void cancel(o.id)} className="min-h-11 sm:min-h-0 px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[11px] font-bold cursor-pointer disabled:opacity-50">
                              Confirmer
                            </button>
                            <button type="button" onClick={() => setConfirmCancelId(null)} className="min-h-11 sm:min-h-0 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-[11px] cursor-pointer">
                              Non
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setConfirmCancelId(o.id)} className="min-h-11 sm:min-h-0 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-[11px] cursor-pointer shrink-0">
                            Annuler
                          </button>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {!data && !error && <p className="text-xs text-slate-500">{loading ? 'Chargement…' : 'Aucune donnée.'}</p>}
    </div>
  );
};
