import React, { useState } from 'react';
import { DatabaseZap, AlertTriangle, RotateCw } from 'lucide-react';
import { tikaFetch } from '../services/tikaFetch';

interface LegacyReport {
  success: boolean;
  error?: string;
  action: 'report' | 'migrate' | 'purge';
  dryRun: boolean;
  scanned: number;
  truncated: boolean;
  currentSchemaCount: number;
  legacy: {
    total: number;
    solo: number;
    multi: number;
    multiManches: number;
    byStatus: Record<string, number>;
    skippedCount: number;
    skippedSample: Array<{ id: string; reason: string }>;
  };
  migration: { fichesToCreate: number; journalsToCreate: number; alreadyPresent: number; created: number };
  purge: { coveredByCurrent: number; notCovered: number; deleted: number };
}

const fmt = (n: number) => n.toLocaleString('fr-FR');
const CONFIRM_WORD = 'SUPPRIMER';

/** Affichage d'un résultat du serveur (rapport, simulation ou action réelle), en lignes simples. */
export const LegacyResultView: React.FC<{ result: LegacyReport }> = ({ result }) => (
  <div className="space-y-2 text-xs text-slate-300" data-testid="legacy-result">
    <p className="font-mono text-slate-400">
      {result.dryRun ? 'Simulation (rien n\'a été modifié)' : 'Action réelle effectuée'} · {fmt(result.scanned)} fiche(s) lue(s)
      {result.truncated ? ' · plafond de lecture atteint : résultat partiel' : ''}
    </p>
    <ul className="space-y-1 list-disc pl-5">
      <li>Fiches au format actuel : <b className="text-white">{fmt(result.currentSchemaCount)}</b></li>
      <li>
        Anciennes fiches : <b className="text-white">{fmt(result.legacy.total)}</b> (solo {fmt(result.legacy.solo)} · multijoueur {fmt(result.legacy.multi)}, soit {fmt(result.legacy.multiManches)} manche(s) distincte(s))
      </li>
      <li>
        Statuts des anciennes fiches : terminées {fmt(result.legacy.byStatus.completed || 0)} · abandonnées {fmt(result.legacy.byStatus.abandoned || 0)} · en cours {fmt(result.legacy.byStatus.in_progress || 0)}
      </li>
      <li>
        Migration : à créer {fmt(result.migration.fichesToCreate)} fiche(s) et {fmt(result.migration.journalsToCreate)} partie(s) · déjà présentes {fmt(result.migration.alreadyPresent)}
        {!result.dryRun && result.action === 'migrate' ? ` · créées ${fmt(result.migration.created)}` : ''}
      </li>
      {result.action === 'purge' && (
        <li>
          Suppression : couvertes par le format actuel {fmt(result.purge.coveredByCurrent)} · conservées (non couvertes) {fmt(result.purge.notCovered)}
          {!result.dryRun ? ` · supprimées ${fmt(result.purge.deleted)}` : ''}
        </li>
      )}
    </ul>
    {result.legacy.skippedCount > 0 && (
      <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-2.5">
        <p className="text-amber-300 font-semibold">
          {fmt(result.legacy.skippedCount)} ancienne(s) fiche(s) non migrable(s) : elles restent en place.
        </p>
        <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-slate-400">
          {result.legacy.skippedSample.slice(0, 5).map((s) => (
            <li key={s.id}>{s.id} : {s.reason}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

/**
 * Maintenance des anciennes fiches de manche (écrites par les téléphones avant les correctifs) :
 * 1) rapport en lecture seule, 2) migration vers le format actuel, 3) suppression vérifiée de l'ancien.
 * La suppression ne retire que les fiches dont la copie actuelle existe et les couvre ; elle exige de taper « SUPPRIMER ».
 */
export const KatikaLegacyRecordsPanel: React.FC = () => {
  const [result, setResult] = useState<LegacyReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [pendingMigrate, setPendingMigrate] = useState<boolean>(false);
  const [pendingPurge, setPendingPurge] = useState<boolean>(false);
  const [typed, setTyped] = useState<string>('');

  const call = async (action: 'report' | 'migrate' | 'purge', dryRun: boolean) => {
    setLoading(true);
    setError('');
    try {
      const res = await tikaFetch('/api/katika/legacy-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dryRun ? { action, dryRun: true } : { action, dryRun: false, confirm: 'CONFIRMER' }),
      });
      const json = (await res.json()) as LegacyReport;
      if (!res.ok || !json.success) {
        setError(json.error || `Erreur ${res.status}`);
      } else {
        setResult(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setLoading(false);
      setPendingMigrate(false);
      setPendingPurge(false);
      setTyped('');
    }
  };

  const hasLegacy = Boolean(result && result.legacy.total > 0);
  const canMigrate = Boolean(result && result.migration.fichesToCreate > 0);

  return (
    <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4" data-testid="katika-legacy-panel">
      <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
        <DatabaseZap className="w-4 h-4 text-amber-400" />
        <div>
          <h3 className="text-sm font-bold text-white">Maintenance des données : anciennes fiches de manche</h3>
          <p className="text-[11px] text-slate-400">
            Fiches écrites par les téléphones avant les correctifs. Étape 1 : rapport. Étape 2 : migration. Étape 3 : suppression vérifiée.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
        <span>
          La suppression est définitive. Elle ne retire une ancienne fiche que si sa copie au format actuel existe et la couvre. Si possible, exporte la base depuis la console Firebase avant de supprimer.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={loading}
          onClick={() => call('report', true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium cursor-pointer disabled:opacity-50"
        >
          <RotateCw className={`w-3.5 h-3.5 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
          <span>1. Voir le rapport</span>
        </button>

        {!pendingMigrate ? (
          <button
            type="button"
            disabled={loading || !canMigrate}
            onClick={() => setPendingMigrate(true)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium cursor-pointer disabled:opacity-40"
            title={canMigrate ? '' : 'Lancer d\'abord le rapport : il faut des fiches à migrer'}
          >
            2. Migrer vers le format actuel
          </button>
        ) : (
          <span className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => call('migrate', false)}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              Confirmer la migration ({fmt(result?.migration.fichesToCreate ?? 0)} fiche(s))
            </button>
            <button type="button" onClick={() => setPendingMigrate(false)} className="text-xs text-slate-400 hover:text-white cursor-pointer">Annuler</button>
          </span>
        )}

        <button
          type="button"
          disabled={loading || !hasLegacy}
          onClick={() => call('purge', true)}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium cursor-pointer disabled:opacity-40"
          title={hasLegacy ? '' : 'Lancer d\'abord le rapport : il faut des anciennes fiches'}
        >
          3. Vérifier la suppression
        </button>
      </div>

      {result && result.action === 'purge' && result.dryRun && result.purge.coveredByCurrent > 0 && (
        <div className="space-y-2 rounded-lg bg-rose-500/5 border border-rose-500/30 p-3">
          {!pendingPurge ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => setPendingPurge(true)}
              className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              Supprimer {fmt(result.purge.coveredByCurrent)} ancienne(s) fiche(s) couverte(s)
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-rose-200">Tape « {CONFIRM_WORD} » pour confirmer :</span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-white font-mono w-32"
                aria-label="Confirmation de suppression"
              />
              <button
                type="button"
                disabled={loading || typed !== CONFIRM_WORD}
                onClick={() => call('purge', false)}
                className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold cursor-pointer disabled:opacity-40"
              >
                Supprimer définitivement
              </button>
              <button type="button" onClick={() => { setPendingPurge(false); setTyped(''); }} className="text-xs text-slate-400 hover:text-white cursor-pointer">Annuler</button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-200">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {result ? (
        <LegacyResultView result={result} />
      ) : (
        <p className="text-[11px] text-slate-500">Aucun rapport lancé pour l'instant.</p>
      )}
    </div>
  );
};
