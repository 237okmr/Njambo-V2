import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCw, Eraser } from 'lucide-react';
import { tikaFetch } from '../services/tikaFetch';

interface CleanupLine {
  uid: string;
  simulatedTotal: number;
  available: number;
  deduction: number;
}

const fmt = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;

/**
 * Correction des soldes fictifs de démo : l'ancien dépôt « simulé » a crédité de l'argent fictif qui s'est mélangé aux vrais essais Campay.
 * L'aperçu liste les joueurs concernés ; l'application retire la somme simulée par une ligne « ajustement » au registre (rien n'est effacé).
 */
export const KatikaDemoCleanupCard: React.FC = () => {
  const [lines, setLines] = useState<CleanupLine[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [applying, setApplying] = useState<boolean>(false);
  const [armed, setArmed] = useState<boolean>(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setArmed(false);
    try {
      const res = await tikaFetch('/api/katika/cash/demo-cleanup');
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Aperçu impossible.');
      setLines(body.lines as CleanupLine[]);
      setTotal(Number(body.totalDeduction) || 0);
    } catch (err) {
      setLines(null);
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Aperçu impossible.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const apply = async () => {
    setApplying(true);
    setMessage(null);
    try {
      const res = await tikaFetch('/api/katika/cash/demo-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Correction impossible.');
      setMessage({ ok: true, text: `Correction appliquée : ${body.applied} joueur(s) corrigé(s), ${fmt(Number(body.totalDeducted) || 0)} retirés (${body.skipped} ignoré(s)).` });
      await loadPreview();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Correction impossible.' });
    } finally {
      setApplying(false);
      setArmed(false);
    }
  };

  return (
    <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Eraser className="w-4 h-4 text-amber-400" />
            Correction des soldes fictifs de démo
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Retire des soldes de démo l'argent fictif créé par l'ancien dépôt simulé, sans toucher aux paiements Campay de test.
            Une ligne « ajustement » est ajoutée au registre de chaque joueur concerné ; rien n'est effacé.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadPreview()}
          disabled={loading || applying}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RotateCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualiser</span>
        </button>
      </div>

      {lines === null ? (
        <p className="text-xs text-slate-500">{loading ? 'Chargement de l\'aperçu…' : 'Aperçu indisponible.'}</p>
      ) : lines.length === 0 ? (
        <p className="text-xs text-emerald-300">Aucun solde fictif à corriger.</p>
      ) : (
        <>
          <p className="text-xs text-slate-300">
            {lines.length} joueur(s) concerné(s) — {fmt(total)} à retirer au total.
          </p>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {lines.map((l) => (
              <li key={l.uid} className="flex items-center justify-between gap-2 text-[11px] text-slate-400 font-mono">
                <span className="truncate">{l.uid.slice(0, 10)}…</span>
                <span>
                  solde {fmt(l.available)} → retrait {fmt(l.deduction)}
                </span>
              </li>
            ))}
          </ul>
          {armed ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void apply()}
                disabled={applying}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-60 flex items-center gap-2"
              >
                {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Confirmer le retrait de {fmt(total)}</span>
              </button>
              <button
                type="button"
                onClick={() => setArmed(false)}
                disabled={applying}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs cursor-pointer"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setArmed(true)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-200 text-xs font-bold cursor-pointer"
            >
              Appliquer la correction
            </button>
          )}
        </>
      )}

      {message && <p className={`text-xs ${message.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{message.text}</p>}
    </div>
  );
};
