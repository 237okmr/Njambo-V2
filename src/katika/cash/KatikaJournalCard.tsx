import React, { useState } from 'react';
import { Download, Loader2, ScrollText } from 'lucide-react';
import { tikaFetch } from '../services/tikaFetch';
import { useKatikaAuth } from '../context/KatikaAuthContext';
import { can } from '../utils/katikaAccess';

interface JournalLine {
  ref: string;
  uid: string;
  name: string;
  kind: string;
  label: string;
  amount: number;
  availableBefore: number;
  availableAfter: number;
  lockedBefore: number;
  lockedAfter: number;
  createdAt: number;
  tableId?: string;
  roomCode?: string;
  actor?: string;
  note?: string;
}

type Environment = 'DEMO' | 'LIVE';
type Period = 'DAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

const KIND_OPTIONS: { id: string; label: string }[] = [
  { id: '', label: 'Tous les types' },
  { id: 'DEPOSIT', label: 'Dépôt' },
  { id: 'TABLE_BUYIN', label: 'Entrée à une table' },
  { id: 'TABLE_CASHOUT', label: 'Sortie de table' },
  { id: 'TABLE_SETTLEMENT', label: 'Résultat de partie' },
  { id: 'WITHDRAWAL_HOLD', label: 'Retrait demandé' },
  { id: 'WITHDRAWAL_REFUND', label: 'Retrait remboursé' },
  { id: 'ADJUSTMENT', label: 'Ajustement' },
];

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: 'DAY', label: '24 heures' },
  { id: 'WEEK', label: '7 jours' },
  { id: 'MONTH', label: '30 jours' },
  { id: 'CUSTOM', label: 'Dates choisies' },
];

const fmt = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;
const fmtSigned = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('fr-FR')} FCFA`;
const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Douala' });

/** Début ou fin d'une journée choisie, en heure de Douala (UTC+1, sans heure d'été). */
function doualaDayBound(dateText: string, end: boolean): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const utcMidnight = Date.parse(`${dateText}T00:00:00Z`);
  if (!Number.isFinite(utcMidnight)) return null;
  const startOfDay = utcMidnight - 3600000;
  return end ? startOfDay + 86400000 - 1 : startOfDay;
}

const selectClass = 'h-9 px-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs';

/**
 * Journal global des transactions Kora Cash. Chargé au clic seulement : chaque ligne lue compte dans le quota gratuit de Firestore.
 * Le serveur borne la période, filtre le type et le joueur, et s'arrête à son plafond de lectures (réglable dans katika).
 */
export const KatikaJournalCard: React.FC = () => {
  const { access } = useKatikaAuth();
  const canExport = can(access, 'cash.manage');

  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [period, setPeriod] = useState<Period>('WEEK');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [kind, setKind] = useState<string>('');
  const [player, setPlayer] = useState<string>('');

  const [lines, setLines] = useState<JournalLine[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadedWindow, setWindow] = useState<{ from: number; to: number; environment: Environment } | null>(null);
  const [scanned, setScanned] = useState<number>(0);
  const [capped, setCapped] = useState<boolean>(false);
  const [playerNotFound, setPlayerNotFound] = useState<boolean>(false);
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const buildParams = (more: boolean): URLSearchParams | null => {
    const params = new URLSearchParams();
    if (environment) params.set('env', environment);
    if (kind) params.set('kind', kind);
    if (player.trim()) params.set('player', player.trim());
    if (more && loadedWindow) {
      // Pages suivantes : la même fenêtre exacte que la première, pour ne rien sauter ni lire deux fois.
      params.set('period', 'CUSTOM');
      params.set('from', String(loadedWindow.from));
      params.set('to', String(loadedWindow.to));
      if (nextCursor) params.set('cursor', nextCursor);
      return params;
    }
    if (period === 'CUSTOM') {
      const from = doualaDayBound(dateFrom, false);
      const to = doualaDayBound(dateTo || dateFrom, true);
      if (from === null || to === null || to < from) return null;
      params.set('period', 'CUSTOM');
      params.set('from', String(from));
      params.set('to', String(to));
    } else {
      params.set('period', period);
    }
    return params;
  };

  const load = async (more: boolean) => {
    setError(null);
    setInfo(null);
    const params = buildParams(more);
    if (!params) {
      setError('Choisis une date de début valide (et une fin qui ne la précède pas).');
      return;
    }
    setLoading(true);
    try {
      const res = await tikaFetch(`/api/katika/cash/journal?${params.toString()}`);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Lecture du journal impossible.');
      const incoming = body.lines as JournalLine[];
      setLines((prev) => (more && prev ? [...prev, ...incoming] : incoming));
      setNextCursor(body.nextCursor ?? null);
      setWindow({ from: body.from, to: body.to, environment: body.environment });
      setScanned((prev) => (more ? prev + (body.scanned || 0) : body.scanned || 0));
      setCapped(body.capped === true);
      setPlayerNotFound(body.playerNotFound === true);
      if (!more) setOpenRef(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lecture du journal impossible.');
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = async () => {
    setError(null);
    setInfo(null);
    const params = buildParams(false);
    if (!params) {
      setError('Choisis une date de début valide (et une fin qui ne la précède pas).');
      return;
    }
    setExporting(true);
    try {
      const res = await tikaFetch(`/api/katika/cash/journal/export?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Export impossible.');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = match?.[1] || 'journal-kora-cash.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      const count = Number(res.headers.get('X-Journal-Lines') || 0);
      setInfo(
        res.headers.get('X-Journal-Truncated') === '1'
          ? `Export incomplet : ${count} ligne(s) écrites, le plafond est atteint. Resserre la période ou les filtres pour tout avoir.`
          : `Export terminé : ${count} ligne(s).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export impossible.');
    } finally {
      setExporting(false);
    }
  };

  const shownEnvironment = loadedWindow?.environment ?? environment;

  return (
    <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-amber-400" />
          Journal des transactions
        </h3>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Tous les mouvements du portefeuille, plus récents d’abord. Rien n’est lu avant ton clic : chaque ligne lue compte dans le quota gratuit.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div role="radiogroup" aria-label="Environnement" className="flex rounded-lg overflow-hidden border border-slate-700">
          {(
            [
              [null, 'Actif'],
              ['DEMO', 'Démo'],
              ['LIVE', 'Réel'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={environment === id}
              onClick={() => setEnvironment(id)}
              className={`h-9 px-3 text-xs font-bold cursor-pointer ${environment === id ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-xs text-slate-400">
          <span>Période</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className={selectClass}>
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {period === 'CUSTOM' && (
          <>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              <span>Du</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={selectClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              <span>Au</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={selectClass} />
            </label>
          </>
        )}

        <label className="flex flex-col gap-1 text-xs text-slate-400">
          <span>Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={selectClass}>
            {KIND_OPTIONS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-400 min-w-[10rem] flex-1">
          <span>Joueur (nom ou identifiant)</span>
          <input
            type="text"
            value={player}
            onChange={(e) => setPlayer(e.target.value)}
            placeholder="Tous les joueurs"
            className={`${selectClass} w-full`}
          />
        </label>

        <button
          type="button"
          onClick={() => void load(false)}
          disabled={loading}
          className="h-9 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
        >
          {loading && !lines?.length && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>{lines === null ? 'Charger le journal' : 'Actualiser'}</span>
        </button>

        {canExport && (
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={exporting}
            title="Exporte ce que les filtres affichent. L’export est inscrit au journal d’audit."
            className="h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>Exporter en CSV</span>
          </button>
        )}
      </div>

      {error && <p className="text-xs text-rose-300">{error}</p>}
      {info && <p className="text-xs text-emerald-300">{info}</p>}

      {lines !== null && (
        <>
          <p className="text-xs text-slate-500">
            {shownEnvironment === 'LIVE' ? 'Registre réel' : 'Registre de démo'} · {lines.length} ligne(s) affichée(s) · {scanned} lue(s)
          </p>

          {playerNotFound ? (
            <p className="text-xs text-slate-400">Aucun joueur ne correspond à cette recherche.</p>
          ) : lines.length === 0 ? (
            <p className="text-xs text-slate-400">
              {capped ? 'Aucune ligne trouvée dans les premières lectures. Continue pour chercher plus loin, ou resserre les filtres.' : 'Aucune transaction pour ces filtres.'}
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-[34rem] overflow-y-auto">
              {lines.map((l) => {
                const open = openRef === l.ref;
                return (
                  <li key={l.ref} className="text-xs text-slate-300 border border-slate-800 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setOpenRef(open ? null : l.ref)}
                      aria-expanded={open}
                      className="w-full grid grid-cols-[6.5rem_1fr_auto] sm:grid-cols-[6.5rem_1fr_9rem_8rem_9rem] gap-x-3 gap-y-0.5 items-center px-3 py-2 text-left cursor-pointer hover:bg-slate-900/60"
                    >
                      <span className="text-slate-500">{fmtDate(l.createdAt)}</span>
                      <span className="font-semibold text-slate-100 truncate">{l.name}</span>
                      <span className="hidden sm:block text-slate-400 truncate">{l.label}</span>
                      <span className={`font-bold text-right ${l.amount > 0 ? 'text-emerald-300' : l.amount < 0 ? 'text-rose-300' : 'text-slate-400'}`}>{fmtSigned(l.amount)}</span>
                      <span className="hidden sm:block text-right text-slate-400">{fmt(l.availableAfter)}</span>
                      <span className="sm:hidden col-span-3 text-slate-400">{l.label} · solde {fmt(l.availableAfter)}</span>
                    </button>
                    {open && (
                      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 px-3 pb-3 pt-1 border-t border-slate-800 text-slate-400">
                        <div>Disponible : {fmt(l.availableBefore)} → {fmt(l.availableAfter)}</div>
                        <div>En table : {fmt(l.lockedBefore)} → {fmt(l.lockedAfter)}</div>
                        {(l.roomCode || l.tableId) && <div>Table : <span className="font-mono">{l.roomCode ?? l.tableId}</span></div>}
                        <div>Joueur : <span className="font-mono">{l.uid}</span></div>
                        {l.actor && <div>Acteur : <span className="font-mono">{l.actor}</span></div>}
                        {l.note && <div className="sm:col-span-2">Note : {l.note}</div>}
                        <div className="sm:col-span-2">Référence : <span className="font-mono break-all">{l.ref}</span></div>
                      </dl>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {nextCursor && !playerNotFound && (
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={loading}
              className="w-full h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{capped ? 'Plafond de lectures atteint : continuer' : 'Charger plus'}</span>
            </button>
          )}
        </>
      )}
    </div>
  );
};
