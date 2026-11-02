import React, { useCallback, useEffect, useState } from 'react';
import { RotateCw, Table2 } from 'lucide-react';
import { tikaFetch } from '../services/tikaFetch';

interface Settings {
  enabled: boolean;
  betLevels: number[];
  minBuyInMultiple: number;
  maxBuyInMultiple: number;
  rakePercent: number;
}

interface LiveTable {
  roomCode: string;
  tableId: string;
  status: string;
  bet: number;
  isPublic: boolean;
  rakePercent: number;
  players: { name: string; capital: number; connected: boolean }[];
}

interface StrandedSeat {
  tableId: string;
  uid: string;
  roomCode: string;
  betLevel: number;
  buyInTotal: number;
  openedAt: number;
}

const fmt = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;
const fmtDate = (ms: number) => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const NUMERIC_FIELDS: { key: 'minBuyInMultiple' | 'maxBuyInMultiple' | 'rakePercent'; label: string; help: string }[] = [
  { key: 'minBuyInMultiple', label: 'Entrée minimale (× la mise)', help: 'S’applique aux tables ouvertes ensuite.' },
  { key: 'maxBuyInMultiple', label: 'Entrée maximale (× la mise)', help: 'Limite aussi la recave.' },
  { key: 'rakePercent', label: 'Commission (%)', help: 'Sur le pot gagné, sans plafond. Une table garde le taux de son ouverture.' },
];

/**
 * Réglages et suivi des tables Cash. Les données ne s'actualisent qu'à la demande (une lecture bornée par clic).
 * « Argent à rendre » : sièges dont la table n'existe plus, après un redémarrage du serveur ou une écriture échouée.
 */
export const KatikaCashTablesCard: React.FC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tables, setTables] = useState<LiveTable[]>([]);
  const [stranded, setStranded] = useState<StrandedSeat[]>([]);
  const [recentRake, setRecentRake] = useState<{ total: number; parties: number }>({ total: 0, parties: 0 });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tikaFetch('/api/katika/cash/tables');
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Lecture impossible.');
      setSettings(body.settings as Settings);
      setTables(body.tables as LiveTable[]);
      setStranded(body.strandedSeats as StrandedSeat[]);
      setRecentRake(body.recentRake);
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
      const res = await tikaFetch('/api/katika/cash/table-settings', {
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

  const refund = async (seat: StrandedSeat) => {
    const id = `${seat.tableId}:${seat.uid}`;
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const res = await tikaFetch(`/api/katika/cash/table-seats/${encodeURIComponent(seat.tableId)}/${encodeURIComponent(seat.uid)}/refund`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Remboursement impossible.');
      setNotice(`${fmt(body.amount)} rendus au joueur.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remboursement impossible.');
    } finally {
      setBusyId(null);
    }
  };

  const levelsValue = draft.betLevels ?? settings?.betLevels.join(', ') ?? '';
  const levelsChanged = settings ? levelsValue !== settings.betLevels.join(', ') : false;
  const engaged = tables.reduce((total, t) => total + t.players.reduce((sum, p) => sum + p.capital, 0), 0);

  return (
    <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Table2 className="w-4 h-4 text-amber-400" />
            Tables Cash
            {stranded.length > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">{stranded.length} à rendre</span>}
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Solde de démo, mais vrai débit : dès que le retrait Campay s’ouvre, les gains seront retirables. Ouvre seulement après en avoir mesuré les conséquences.
          </p>
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
      {notice && <p className="text-xs text-emerald-300">{notice}</p>}

      {settings && (
        <div className="space-y-3 pb-4 border-b border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-200">Ouvrir les tables aux joueurs</span>
            <button
              type="button"
              id="btn-cash-tables-toggle"
              onClick={() => void saveSettings({ enabled: !settings.enabled })}
              className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                settings.enabled ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {settings.enabled ? 'Ouvert' : 'Fermé'}
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              <span className="font-semibold">Niveaux de mise (FCFA)</span>
              <span className="flex items-center gap-2">
                <input
                  type="text"
                  value={levelsValue}
                  onChange={(e) => setDraft((d) => ({ ...d, betLevels: e.target.value }))}
                  className="min-w-0 flex-1 h-9 px-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                />
                {levelsChanged && (
                  <button
                    type="button"
                    onClick={() => void saveSettings({ betLevels: levelsValue.split(',').map((v) => Number(v.trim())) })}
                    className="h-9 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
                  >
                    OK
                  </button>
                )}
              </span>
              <span className="text-slate-500">Séparés par des virgules. Un dépôt de démo est limité à 25 FCFA.</span>
            </label>
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
          <div className="text-slate-400">Tables en cours</div>
          <div className="font-bold text-white">{tables.length}</div>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
          <div className="text-slate-400">Argent sur ces tables</div>
          <div className="font-bold text-white">{fmt(engaged)}</div>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
          <div className="text-slate-400">Commission ({recentRake.parties} dernières parties)</div>
          <div className="font-bold text-white">{fmt(recentRake.total)}</div>
        </div>
      </div>

      {stranded.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-amber-300">Argent à rendre</h4>
          <p className="text-xs text-slate-400 leading-relaxed">La table de ces sièges n’existe plus. Le montant rendu vient du registre : la partie interrompue est annulée.</p>
          {stranded.map((seat) => {
            const id = `${seat.tableId}:${seat.uid}`;
            return (
              <div key={id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900 border border-amber-500/30 text-xs text-slate-200">
                <span>
                  Joueur {seat.uid.slice(0, 8)}… · table {seat.roomCode} · mise {fmt(seat.betLevel)} · entrée {fmt(seat.buyInTotal)} · {fmtDate(seat.openedAt)}
                </span>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void refund(seat)}
                  className="h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer disabled:opacity-50"
                >
                  {busyId === id ? 'En cours…' : 'Rendre'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-300">Tables en cours</h4>
        {tables.length === 0 ? (
          <p className="text-xs text-slate-500">Aucune table en cours.</p>
        ) : (
          tables.map((t) => (
            <div key={t.tableId} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200">
              <div className="font-bold">
                {t.roomCode} · mise {fmt(t.bet)} · {t.isPublic ? 'publique' : 'privée'} · {t.rakePercent} % · {t.status}
              </div>
              <div className="text-slate-400 mt-0.5">
                {t.players.map((p) => `${p.name} ${fmt(p.capital)}${p.connected ? '' : ' (absent)'}`).join(' · ') || 'Personne'}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
