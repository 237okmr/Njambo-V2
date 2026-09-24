import React, { useMemo, useState } from 'react';
import { ENGINE_PARAMS, ParamDef, ParamGroup } from '../../../../server/engine/engineParams';
import type { KatikaGameConfig } from '../../types/katika';
import { KatikaNumberSliderField } from './KatikaNumberSliderField';

/**
 * Panneau générique des paramètres du registre (server/engine/engineParams.ts).
 * Toute entrée ajoutée au registre apparaît ici automatiquement : aucun code d'interface à écrire.
 */
const GROUP_LABELS: Record<ParamGroup, string> = {
  partie: 'Partie',
  connexion: 'Connexion',
  salons: 'Salons et tables',
  moderation: 'Modération Fair-Play',
  notifications: 'Notifications',
  'caches-et-mises-a-jour': 'Caches et mises à jour',
  interface: 'Interface',
  katika: 'Katika (administration)',
};

const GROUP_ORDER: ParamGroup[] = [
  'partie',
  'connexion',
  'salons',
  'moderation',
  'notifications',
  'caches-et-mises-a-jour',
  'interface',
  'katika',
];

const EFFECT_LABELS: Record<ParamDef['effect'], string> = {
  immediate: 'Effet immédiat',
  next_room: 'S\'applique aux prochaines tables',
  next_connection: 'S\'applique à la prochaine connexion des joueurs',
};

const UNIT_LABELS: Record<string, string> = { s: 's', ms: 'ms', min: 'min', jours: 'j', '': '' };

interface KatikaParamsPanelProps {
  config: KatikaGameConfig;
  setConfig: React.Dispatch<React.SetStateAction<KatikaGameConfig>>;
}

export const KatikaParamsPanel: React.FC<KatikaParamsPanelProps> = ({ config, setConfig }) => {
  const [search, setSearch] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const values = config as unknown as Record<string, unknown>;

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return GROUP_ORDER.map((group) => {
      const params = ENGINE_PARAMS.filter((p) => {
        if (p.group !== group || p.deprecated) return false;
        if (!showAdvanced && p.advanced && !q) return false;
        if (!q) return true;
        return (
          p.label.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q) ||
          p.help.toLowerCase().includes(q)
        );
      });
      return { group, params };
    }).filter((g) => g.params.length > 0);
  }, [search, showAdvanced]);

  const setValue = (key: string, value: number | boolean) => {
    setConfig((prev) => ({ ...prev, [key]: value } as KatikaGameConfig));
  };

  const resetGroup = (params: ParamDef[]) => {
    setConfig((prev) => {
      const next = { ...prev } as unknown as Record<string, unknown>;
      for (const p of params) next[p.key] = p.default;
      return next as unknown as KatikaGameConfig;
    });
  };

  const renderParam = (p: ParamDef) => {
    const unit = UNIT_LABELS[p.unit] ?? '';
    const current = values[p.key] ?? p.default;
    const defaultText = p.type === 'boolean' ? (p.default ? 'activé' : 'désactivé') : `${p.default} ${unit}`.trim();
    const description = `${p.help} Défaut : ${defaultText}. ${EFFECT_LABELS[p.effect]}.${p.locked ? ' Défaut protégé.' : ''}`;

    if (p.type === 'boolean') {
      return (
        <label
          key={p.key}
          className="flex items-start gap-3 p-4 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={Boolean(current)}
            onChange={(e) => setValue(p.key, e.target.checked)}
            className="mt-0.5 accent-cyan-400"
          />
          <span className="space-y-1">
            <span className="block text-xs font-semibold text-slate-200">{p.label}</span>
            <span className="block text-[11px] text-slate-400 leading-relaxed">{description}</span>
          </span>
        </label>
      );
    }

    const min = p.allowZero ? 0 : p.min;
    const step = p.unit === 'ms' ? (p.max - p.min >= 10000 ? 500 : 50) : 1;
    return (
      <KatikaNumberSliderField
        key={p.key}
        id={`param-${p.key}`}
        label={p.label}
        description={description}
        value={Number(current)}
        onChange={(val) => setValue(p.key, val)}
        min={min}
        max={p.max}
        step={step}
        unit={unit}
        accentColor={p.locked ? 'amber' : 'cyan'}
      />
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un réglage (chrono, grâce, cache...)"
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
        />
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showAdvanced}
            onChange={(e) => setShowAdvanced(e.target.checked)}
            className="accent-cyan-400"
          />
          Afficher les réglages avancés
        </label>
      </div>

      {grouped.length === 0 && (
        <p className="text-xs text-slate-500">Aucun réglage ne correspond à cette recherche.</p>
      )}

      {grouped.map(({ group, params }) => (
        <details key={group} open={Boolean(search.trim()) || group === 'partie'} className="rounded-xl border border-slate-800 bg-slate-900/60">
          <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none">
            <span className="text-sm font-bold text-white">{GROUP_LABELS[group]}</span>
            <span className="text-[11px] font-mono text-slate-400">{params.length} réglage(s)</span>
          </summary>
          <div className="p-4 space-y-4 border-t border-slate-800">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{params.map(renderParam)}</div>
            <button
              type="button"
              onClick={() => resetGroup(params)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-mono border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 cursor-pointer"
            >
              Rétablir les défauts de ce groupe
            </button>
          </div>
        </details>
      ))}
    </div>
  );
};
