import React, { useCallback, useEffect, useState } from 'react';
import { ArrowUpFromLine, RotateCw } from 'lucide-react';
import { tikaFetch } from '../services/tikaFetch';

interface WithdrawalRow {
  id: string;
  uid: string;
  amount: number;
  fee: number;
  net: number;
  phone: string;
  status: string;
  autoApproved: boolean;
  createdAt: number;
  note?: string;
  campayStatus?: string;
  campayOperator?: string;
  campayReason?: string;
  decidedBy?: string;
  reviewLabels?: string[];
}

interface Settings {
  enabled: boolean;
  autoThresholdFcfa: number;
  dailyAutoFcfa: number;
  feePercent: number;
  maxPhones: number;
}

const fmt = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;
const fmtDate = (ms: number) => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const STATUS_LABELS: Record<string, string> = {
  HOLDING: 'Mise de côté en cours',
  AWAITING_APPROVAL: 'À valider',
  READY: 'Prêt à partir',
  SENDING: 'Envoi en cours',
  PROCESSING: 'Chez Campay',
  REVIEW: 'À vérifier',
  REFUNDING: 'Remboursement en cours',
  SUCCESS: 'Envoyé',
  FAILED: 'Échoué, remboursé',
  CANCELLED: 'Annulé, remboursé',
};

const NEEDS_ACTION = ['AWAITING_APPROVAL', 'REVIEW', 'REFUNDING', 'SENDING', 'HOLDING'];

const NUMERIC_FIELDS: { key: Exclude<keyof Settings, 'enabled'>; label: string; help: string }[] = [
  { key: 'autoThresholdFcfa', label: 'Seuil automatique (FCFA)', help: 'Jusqu’à ce montant, un retrait part sans validation.' },
  { key: 'dailyAutoFcfa', label: 'Total automatique par jour (FCFA)', help: 'Au-delà, par joueur, tout attend ta validation.' },
  { key: 'feePercent', label: 'Frais de retrait (%)', help: 'À régler d’après le tarif réel de Campay. Le joueur voit le net avant de confirmer.' },
  { key: 'maxPhones', label: 'Numéros par joueur', help: 'Nombre de numéros qu’un joueur peut enregistrer.' },
];

/**
 * Réglages et file de suivi des retraits. Les données ne s'actualisent qu'à la demande (une lecture bornée par clic).
 * Sur un retrait « à vérifier », contrôle d'abord dans le tableau de bord Campay avant de décider : c'est la seule protection contre un double paiement.
 */
export const KatikaWithdrawalsCard: React.FC = () => {
  const [rows, setRows] = useState<WithdrawalRow[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tikaFetch('/api/katika/cash/withdrawals');
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Lecture impossible.');
      setRows(body.withdrawals as WithdrawalRow[]);
      setSettings(body.settings as Settings);
      setDraft({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lecture impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async (patch: Partial<Settings>) => {
    setError(null);
    try {
      const res = await tikaFetch('/api/katika/cash/withdrawal-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Enregistrement impossible.');
      setSettings(body.settings as Settings);
      setDraft({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    }
  };

  const act = async (id: string, action: string, payload?: Record<string, unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await tikaFetch(`/api/katika/cash/withdrawals/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Action impossible.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusyId(null);
    }
  };

  const toDecide = rows?.filter((r) => NEEDS_ACTION.includes(r.status)).length ?? 0;

  return (
    <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <ArrowUpFromLine className="w-4 h-4 text-amber-400" />
            Retraits Mobile Money
            {toDecide > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">{toDecide} à traiter</span>}
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">Démo uniquement. Le retrait réel reste bloqué dans le code.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RotateCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualiser</span>
        </button>
      </div>

      {error && <p className="text-xs text-rose-300">{error}</p>}

      {settings && (
        <div className="space-y-3 pb-4 border-b border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-200">Ouvrir le retrait aux joueurs</span>
            <button
              type="button"
              onClick={() => void saveSettings({ enabled: !settings.enabled })}
              className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                settings.enabled ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {settings.enabled ? 'Ouvert' : 'Fermé'}
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {NUMERIC_FIELDS.map((field) => {
              const value = draft[field.key] ?? String(settings[field.key]);
              const changed = value !== String(settings[field.key]);
              return (
                <label key={field.key} className="flex flex-col gap-1 text-xs text-slate-300">
                  <span className="font-semibold">{field.label}</span>
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                      className="min-w-0 flex-1 h-9 px-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                    />
                    {changed && (
                      <button
                        type="button"
                        onClick={() => void saveSettings({ [field.key]: Number(value) } as Partial<Settings>)}
                        className="h-9 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
                      >
                        OK
                      </button>
                    )}
                  </span>
                  <span className="text-slate-500">{field.help}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {rows === null ? (
        !error && <p className="text-xs text-slate-500">{loading ? 'Chargement…' : 'Aucune donnée.'}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-400">Aucune demande de retrait pour le moment.</p>
      ) : (
        <ul className="space-y-2 max-h-[32rem] overflow-y-auto">
          {rows.map((r) => {
            const busy = busyId === r.id;
            return (
              <li key={r.id} className="text-xs text-slate-300 border border-slate-800 rounded-lg px-3 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">
                    {fmt(r.net)} <span className="font-normal text-slate-500">({fmt(r.amount)} - {fmt(r.fee)} de frais)</span>
                  </span>
                  <span className="text-slate-500 shrink-0">{fmtDate(r.createdAt)}</span>
                </div>
                <div className="text-slate-400">
                  {r.phone} · <span className="font-mono">{r.uid.slice(0, 10)}…</span> · {r.autoApproved ? 'automatique' : 'validation requise'}
                </div>
                <div>
                  État : <span className="font-bold">{STATUS_LABELS[r.status] ?? r.status}</span>
                  {r.campayStatus ? ` · Campay : ${r.campayStatus}` : ''}
                  {r.campayOperator ? ` · ${r.campayOperator}` : ''}
                </div>
                {r.note && <div className="text-amber-200">{r.note}</div>}
                {r.reviewLabels && r.reviewLabels.length > 0 && <div className="text-amber-200">À vérifier : {r.reviewLabels.join(' · ')}</div>}
                {r.campayReason && <div className="text-amber-200">Motif Campay : {r.campayReason}</div>}
                {r.decidedBy && <div className="text-slate-500">Décidé par {r.decidedBy}</div>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {r.status === 'AWAITING_APPROVAL' && (
                    <>
                      <button type="button" disabled={busy} onClick={() => void act(r.id, 'approve')} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer disabled:opacity-50">
                        Valider et envoyer
                      </button>
                      <button type="button" disabled={busy} onClick={() => void act(r.id, 'reject')} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer disabled:opacity-50">
                        Refuser et rembourser
                      </button>
                    </>
                  )}
                  {(r.status === 'PROCESSING' || r.status === 'REVIEW') && (
                    <button type="button" disabled={busy} onClick={() => void act(r.id, 'recheck')} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer disabled:opacity-50">
                      Relire chez Campay
                    </button>
                  )}
                  {(r.status === 'REVIEW' || r.status === 'SENDING') && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Tu confirmes que Campay a bien envoyé cet argent ?')) void act(r.id, 'resolve', { outcome: 'SENT' });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer disabled:opacity-50"
                    >
                      L’argent est parti
                    </button>
                  )}
                  {(r.status === 'REVIEW' || r.status === 'SENDING' || r.status === 'HOLDING' || r.status === 'REFUNDING') && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Tu as vérifié chez Campay que cet argent n’est PAS parti ? Le joueur sera remboursé.')) void act(r.id, 'resolve', { outcome: 'REFUND' });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer disabled:opacity-50"
                    >
                      Pas parti : rembourser
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
