import React, { useCallback, useEffect, useState } from 'react';
import { LineChart, RotateCw } from 'lucide-react';
import { tikaFetch } from '../services/tikaFetch';

interface Settings {
  depositFeePercent: number;
  campayDepositPercent: number;
  campayWithdrawalPercent: number;
  gapAlertFcfa: number;
}

interface Summary {
  depositsGross: number;
  depositFees: number;
  withdrawalsNet: number;
  withdrawalFees: number;
  rake: number;
  campayFees: number;
  margin: number;
}

interface Owed {
  available: number;
  locked: number;
  inFlight: number;
  inFlightCount: number;
  owed: number;
}

interface Report {
  id: string;
  source: 'API' | 'MANUAL';
  campayBalance: number;
  owed: number;
  realMargin: number;
  expectedMargin: number;
  gap: number;
  alert: boolean;
  inFlightCount: number;
  isBaseline: boolean;
  note?: string;
  actor: string;
  createdAt: number;
}

type PeriodKey = 'today' | 'week' | 'month' | 'total';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Aujourd’hui' },
  { key: 'week', label: '7 jours' },
  { key: 'month', label: '30 jours' },
  { key: 'total', label: 'Total' },
];

const ROWS: { key: keyof Summary; label: string; strong?: boolean }[] = [
  { key: 'rake', label: 'Commission des tables' },
  { key: 'depositFees', label: 'Frais de dépôt pris aux joueurs' },
  { key: 'withdrawalFees', label: 'Frais de retrait pris aux joueurs' },
  { key: 'campayFees', label: 'Frais Campay (estimés)' },
  { key: 'margin', label: 'Marge', strong: true },
  { key: 'depositsGross', label: 'Dépôts reçus' },
  { key: 'withdrawalsNet', label: 'Retraits envoyés' },
];

const FIELDS: { key: keyof Settings; label: string; help: string }[] = [
  { key: 'depositFeePercent', label: 'Frais de dépôt pris au joueur (%)', help: 'Le joueur voit le montant crédité avant de payer. 0 pour une promotion.' },
  { key: 'campayDepositPercent', label: 'Frais Campay sur les dépôts (%)', help: 'Tarif indiqué par Campay, pour estimer la marge.' },
  { key: 'campayWithdrawalPercent', label: 'Frais Campay sur les retraits (%)', help: 'Tarif indiqué par Campay, pour estimer la marge.' },
  { key: 'gapAlertFcfa', label: 'Seuil d’alerte d’écart (FCFA)', help: 'À partir de cet écart, le rapprochement affiche une alerte. Aucun gel automatique.' },
];

const fmt = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA`;
const fmtDate = (ms: number) => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Recettes, marge et rapprochement. Les chiffres ne se lisent qu'à la demande (lectures bornées par clic).
 * Un écart n'arrête rien : le gel des retraits reste une décision manuelle, dans « Sécurité et alertes ».
 */
export const KatikaFinanceCard: React.FC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [periods, setPeriods] = useState<Record<PeriodKey, Summary> | null>(null);
  const [owed, setOwed] = useState<Owed | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [hasBaseline, setHasBaseline] = useState<boolean>(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<string>('');
  const [needsManual, setNeedsManual] = useState<boolean>(false);
  const [baselineNote, setBaselineNote] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tikaFetch('/api/katika/cash/finance');
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Lecture impossible.');
      setSettings(body.settings as Settings);
      setPeriods(body.periods as Record<PeriodKey, Summary>);
      setOwed(body.owed as Owed);
      setReports(body.reports as Report[]);
      setHasBaseline(Boolean(body.hasBaseline));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lecture impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSetting = async (key: keyof Settings, value: number) => {
    setError(null);
    try {
      const res = await tikaFetch('/api/katika/cash/finance-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: value }) });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Enregistrement impossible.');
      setDraft((d) => {
        const { [key]: _saved, ...rest } = d;
        return rest;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    }
  };

  const reconcile = async (baseline: boolean) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const manualBalance = manual.trim() === '' ? undefined : Number(manual.replace(',', '.'));
      const res = await tikaFetch('/api/katika/cash/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualBalance, baseline, note: baselineNote }),
      });
      const body = await res.json();
      if (body.needsManual) {
        setNeedsManual(true);
        setNotice(body.error || 'Campay n’a pas donné son solde : saisis celui de ton tableau de bord.');
        return;
      }
      if (!res.ok || !body.success) throw new Error(body.error || 'Rapprochement impossible.');
      setNeedsManual(false);
      setManual('');
      setBaselineNote('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rapprochement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const last = reports[0];

  return (
    <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <LineChart className="w-4 h-4 text-amber-400" />
            Finances
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">Les totaux comptent à partir de la mise en service de cet écran : les opérations plus anciennes n’y figurent pas.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs cursor-pointer disabled:opacity-50 shrink-0">
          <RotateCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualiser</span>
        </button>
      </div>

      {error && <p className="text-xs text-rose-300">{error}</p>}

      {periods && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-slate-200">
            <thead>
              <tr className="text-slate-400">
                <th className="text-left font-semibold py-1.5 pr-2" />
                {PERIODS.map((p) => (
                  <th key={p.key} className="text-right font-semibold py-1.5 pl-2 whitespace-nowrap">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key} className={`border-t border-slate-800 ${row.strong ? 'font-black text-white' : ''}`}>
                  <td className="py-1.5 pr-2">{row.label}</td>
                  {PERIODS.map((p) => (
                    <td key={p.key} className="text-right py-1.5 pl-2 whitespace-nowrap">
                      {periods[p.key][row.key].toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {owed && (
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 space-y-0.5">
          <div className="font-black text-white">Dû aux joueurs : {fmt(owed.owed)}</div>
          <div className="text-slate-400">
            Soldes {fmt(owed.available)} · En table {fmt(owed.locked)} · Retraits en cours {fmt(owed.inFlight)}
          </div>
        </div>
      )}

      <div className="space-y-2 pt-3 border-t border-slate-800">
        <h4 className="text-xs font-bold text-slate-300">Rapprochement</h4>
        <p className="text-xs text-slate-400 leading-relaxed">
          Compare l’argent chez Campay à ce qui est dû aux joueurs. Le solde est lu chez Campay ; si tu saisis un montant, c’est lui qui compte.
        </p>
        <label className="flex flex-col gap-1 text-xs text-slate-300">
          <span className="font-semibold">Solde vu sur le tableau de bord Campay{needsManual ? '' : ' (facultatif)'}</span>
          <input type="text" inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Montant en FCFA" className={`h-9 px-2 rounded-lg bg-slate-900 border text-white ${needsManual ? 'border-amber-400' : 'border-slate-700'}`} />
        </label>
        <button type="button" id="btn-reconcile" disabled={busy} onClick={() => void reconcile(false)} className="h-9 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50">
          {busy ? 'Calcul…' : 'Lancer le rapprochement'}
        </button>
        {notice && <p className="text-xs text-amber-200">{notice}</p>}

        {last && (
          <div id="finance-last-report" className={`p-3 rounded-lg border text-xs space-y-0.5 ${last.alert ? 'bg-rose-500/10 border-rose-500/40 text-rose-100' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-100'}`}>
            <div className="font-black">{last.isBaseline ? 'Point de départ enregistré' : last.alert ? `Écart de ${fmt(last.gap)}` : last.gap === 0 ? 'Les comptes tombent juste' : `Écart de ${fmt(last.gap)}, sous le seuil d’alerte`}</div>
            <div>
              Campay {fmt(last.campayBalance)} ({last.source === 'API' ? 'lu chez Campay' : 'saisi'}) · Dû {fmt(last.owed)} · Marge réelle {fmt(last.realMargin)} · Attendue {fmt(last.expectedMargin)}
            </div>
            {last.inFlightCount > 0 && <div>{last.inFlightCount} retrait(s) en cours au moment du calcul : un écart peut venir d’un envoi déjà parti chez Campay.</div>}
            <div className="opacity-80">{fmtDate(last.createdAt)} · {last.actor}{last.note ? ` · ${last.note}` : ''}</div>
            {last.alert && <div className="font-bold">Rien n’est bloqué. Pour geler les retraits, va dans « Sécurité et alertes ».</div>}
          </div>
        )}

        <div className="flex flex-col gap-1.5 pt-2">
          <span className="text-xs font-semibold text-slate-300">{hasBaseline ? 'Refaire le point de départ' : 'Enregistrer le point de départ'}</span>
          <span className="text-xs text-slate-500">L’écart du moment devient la référence : les rapprochements suivants ne signalent que ce qui change. Aucun solde de joueur n’est modifié.</span>
          <div className="flex flex-wrap items-center gap-2">
            <input type="text" value={baselineNote} onChange={(e) => setBaselineNote(e.target.value)} placeholder="Note (obligatoire)" className="min-w-0 flex-1 h-9 px-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
            <button type="button" disabled={busy || baselineNote.trim() === ''} onClick={() => void reconcile(true)} className="h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-bold cursor-pointer disabled:opacity-50">
              Enregistrer
            </button>
          </div>
        </div>

        {reports.length > 1 && (
          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer font-semibold">Rapprochements précédents</summary>
            <ul className="mt-1.5 space-y-1">
              {reports.slice(1).map((r) => (
                <li key={r.id}>
                  {fmtDate(r.createdAt)} · {r.isBaseline ? 'Point de départ' : `écart ${fmt(r.gap)}`} · Campay {fmt(r.campayBalance)} · Dû {fmt(r.owed)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {settings && (
        <div className="grid sm:grid-cols-2 gap-3 pt-3 border-t border-slate-800">
          {FIELDS.map((field) => {
            const value = draft[field.key] ?? String(settings[field.key]);
            const changed = value !== String(settings[field.key]);
            return (
              <label key={field.key} className="flex flex-col gap-1 text-xs text-slate-300">
                <span className="font-semibold">{field.label}</span>
                <span className="flex items-center gap-2">
                  <input type="number" step="any" value={value} onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))} className="min-w-0 flex-1 h-9 px-2 rounded-lg bg-slate-900 border border-slate-700 text-white" />
                  {changed && (
                    <button type="button" onClick={() => void saveSetting(field.key, Number(value))} className="h-9 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer">
                      OK
                    </button>
                  )}
                </span>
                <span className="text-slate-500">{field.help}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};
