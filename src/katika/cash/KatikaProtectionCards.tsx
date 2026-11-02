import React, { useCallback, useEffect, useState } from 'react';
import { HeartPulse, RotateCw, ShieldAlert } from 'lucide-react';
import { tikaFetch } from '../services/tikaFetch';

interface Settings {
  depositDailyFcfa: number;
  lossDailyFcfa: number;
  limitRaiseDelayHours: number;
  exclusionLiftDelayHours: number;
  abnormalGainFcfa: number;
  withdrawalsFrozen: boolean;
  withdrawalsFrozenNote?: string;
  collusionParties: number;
  collusionOneWayFcfa: number;
  collusionForfeits: number;
}

interface WatchedPlayer {
  uid: string;
  freeze: { by: string; note: string; at: number } | null;
  exclusion: { kind: 'PAUSE' | 'PERMANENT'; startedAt: number; end: number | null; liftAt?: number; liftedBy?: string; liftNote?: string } | null;
}

interface Alert {
  id: string;
  uids: string[];
  label: string;
  parties: number;
  netToA: number;
  createdAt: number;
}

type NumericKey = Exclude<keyof Settings, 'withdrawalsFrozen' | 'withdrawalsFrozenNote'>;
type Field = { key: NumericKey; label: string; help: string };

const fmtDate = (ms: number) => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const shortUid = (uid: string) => `${uid.slice(0, 8)}…`;

const LIMIT_FIELDS: Field[] = [
  { key: 'depositDailyFcfa', label: 'Plafond de dépôt par jour (FCFA)', help: 'Pour chaque joueur. Tu peux le monter ou le baisser.' },
  { key: 'lossDailyFcfa', label: 'Plafond de pertes par jour (FCFA)', help: 'Atteint : plus d’entrée ni de recave jusqu’au lendemain.' },
  { key: 'limitRaiseDelayHours', label: 'Délai pour remonter une limite (heures)', help: 'Un joueur qui remonte sa limite personnelle attend ce délai.' },
  { key: 'exclusionLiftDelayHours', label: 'Délai après une levée d’exclusion (heures)', help: 'L’accès ne revient qu’après ce délai.' },
];

const SECURITY_FIELDS: Field[] = [
  { key: 'abnormalGainFcfa', label: 'Gain anormal du jour (FCFA)', help: 'À partir de ce gain de table, le retrait attend ta validation.' },
  { key: 'collusionParties', label: 'Parties ensemble', help: 'Signalement au-delà de ce nombre de parties entre deux joueurs.' },
  { key: 'collusionOneWayFcfa', label: 'Argent dans le même sens (FCFA)', help: 'Signalement si l’un gagne au moins 8 parties sur 10 et que l’écart atteint ce montant.' },
  { key: 'collusionForfeits', label: 'Forfaits répétés', help: 'Signalement au-delà de ce nombre de forfaits face au même joueur.' },
];

function useProtectionData() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [players, setPlayers] = useState<WatchedPlayer[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tikaFetch('/api/katika/cash/protection');
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Lecture impossible.');
      setSettings(body.settings as Settings);
      setPlayers(body.players as WatchedPlayer[]);
      setAlerts(body.alerts as Alert[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lecture impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (url: string, payload: Record<string, unknown>) => {
    setError(null);
    try {
      const res = await tikaFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Action impossible.');
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
      return false;
    }
  };

  return { settings, players, alerts, loading, error, load, post, saveSettings: (patch: Partial<Settings>) => post('/api/katika/cash/protection-settings', patch) };
}

const CardHeader: React.FC<{ icon: React.ReactNode; title: string; text: string; badge?: string; loading: boolean; onRefresh: () => void }> = ({ icon, title, text, badge, loading, onRefresh }) => (
  <div className="flex items-start justify-between gap-3">
    <div>
      <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
        {icon}
        {title}
        {badge && <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">{badge}</span>}
      </h3>
      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{text}</p>
    </div>
    <button type="button" onClick={onRefresh} disabled={loading} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs cursor-pointer disabled:opacity-50 shrink-0">
      <RotateCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
      <span>Actualiser</span>
    </button>
  </div>
);

const NumericFields: React.FC<{ fields: Field[]; settings: Settings; onSave: (patch: Partial<Settings>) => Promise<boolean> }> = ({ fields, settings, onSave }) => {
  const [draft, setDraft] = useState<Record<string, string>>({});
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {fields.map((field) => {
        const value = draft[field.key] ?? String(settings[field.key]);
        const changed = value !== String(settings[field.key]);
        return (
          <label key={field.key} className="flex flex-col gap-1 text-xs text-slate-300">
            <span className="font-semibold">{field.label}</span>
            <span className="flex items-center gap-2">
              <input type="number" value={value} onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))} className="min-w-0 flex-1 h-9 px-2 rounded-lg bg-slate-900 border border-slate-700 text-white" />
              {changed && (
                <button
                  type="button"
                  onClick={async () => {
                    if (await onSave({ [field.key]: Number(value) } as Partial<Settings>)) {
                      setDraft((d) => {
                        const { [field.key]: _saved, ...rest } = d;
                        return rest;
                      });
                    }
                  }}
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
  );
};

/** Action sur une ligne : elle demande un motif avant de partir. */
const NoteAction: React.FC<{ label: string; placeholder: string; onConfirm: (note: string) => Promise<boolean> }> = ({ label, placeholder, onConfirm }) => {
  const [open, setOpen] = useState<boolean>(false);
  const [note, setNote] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-bold cursor-pointer">
        {label}
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 w-full">
      <input type="text" value={note} autoFocus onChange={(e) => setNote(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 h-8 px-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs" />
      <button
        type="button"
        disabled={busy || note.trim() === ''}
        onClick={async () => {
          setBusy(true);
          if (await onConfirm(note)) {
            setOpen(false);
            setNote('');
          }
          setBusy(false);
        }}
        className="h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
      >
        Confirmer
      </button>
      <button type="button" onClick={() => setOpen(false)} className="h-8 px-2 text-xs text-slate-400 underline cursor-pointer">
        Annuler
      </button>
    </span>
  );
};

/** Plafonds et exclusions. Toute levée exige une note et n'agit qu'après le délai réglé. */
export const KatikaResponsibleGamingCard: React.FC = () => {
  const { settings, players, loading, error, load, post, saveSettings } = useProtectionData();
  const excluded = players.filter((p) => p.exclusion);
  return (
    <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
      <CardHeader
        icon={<HeartPulse className="w-4 h-4 text-amber-400" />}
        title="Jeu responsable"
        text="Une exclusion ferme dépôts et tables. Le retrait reste toujours possible."
        badge={excluded.length > 0 ? `${excluded.length} en pause ou exclus` : undefined}
        loading={loading}
        onRefresh={() => void load()}
      />
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {settings && <NumericFields fields={LIMIT_FIELDS} settings={settings} onSave={saveSettings} />}
      <div className="space-y-2 pt-3 border-t border-slate-800">
        <h4 className="text-xs font-bold text-slate-300">Pauses et exclusions en cours</h4>
        {excluded.length === 0 && <p className="text-xs text-slate-500">Aucune.</p>}
        {excluded.map((p) => (
          <div key={p.uid} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200">
            <span>
              Joueur {shortUid(p.uid)} · {p.exclusion?.kind === 'PERMANENT' ? 'Exclusion définitive' : 'Pause'}
              {p.exclusion?.end ? ` jusqu’au ${fmtDate(p.exclusion.end)}` : ''}
              {p.exclusion?.liftedBy ? ` · levée par ${p.exclusion.liftedBy} : ${p.exclusion.liftNote}` : ''}
            </span>
            {!p.exclusion?.liftedBy && (
              <NoteAction label="Lever" placeholder="Motif de la levée (obligatoire)" onConfirm={(note) => post(`/api/katika/cash/protection-players/${encodeURIComponent(p.uid)}/lift-exclusion`, { note })} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Gel des retraits et signalements de collusion. Un signalement ne bloque rien : la décision reste la tienne. */
export const KatikaSecurityCard: React.FC = () => {
  const { settings, players, alerts, loading, error, load, post, saveSettings } = useProtectionData();
  const [uid, setUid] = useState<string>('');
  const frozen = players.filter((p) => p.freeze);
  const freeze = (target: string, note: string) => post(`/api/katika/cash/protection-players/${encodeURIComponent(target)}/freeze`, { note });
  return (
    <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
      <CardHeader
        icon={<ShieldAlert className="w-4 h-4 text-amber-400" />}
        title="Sécurité et alertes"
        text="Geler un retrait laisse l’argent sur le solde du joueur : rien n’est saisi."
        badge={alerts.length > 0 ? `${alerts.length} signalement${alerts.length > 1 ? 's' : ''}` : undefined}
        loading={loading}
        onRefresh={() => void load()}
      />
      {error && <p className="text-xs text-rose-300">{error}</p>}

      {settings && (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-200">Geler tous les retraits</div>
            <div className="text-xs text-slate-400">{settings.withdrawalsFrozen ? `Gelés : ${settings.withdrawalsFrozenNote}` : 'Les retraits suivent leur cours normal.'}</div>
          </div>
          {settings.withdrawalsFrozen ? (
            <button type="button" onClick={() => void saveSettings({ withdrawalsFrozen: false })} className="px-4 py-2 rounded-lg text-xs font-bold cursor-pointer bg-rose-500/15 text-rose-300 border border-rose-500/40">
              Lever le gel
            </button>
          ) : (
            <NoteAction label="Geler" placeholder="Motif du gel (obligatoire)" onConfirm={(note) => saveSettings({ withdrawalsFrozen: true, withdrawalsFrozenNote: note })} />
          )}
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-300">Geler un joueur</h4>
        <input type="text" value={uid} onChange={(e) => setUid(e.target.value)} placeholder="Identifiant du joueur" className="w-full h-9 px-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
        {uid.trim() !== '' && <NoteAction label="Geler ce joueur" placeholder="Motif du gel (obligatoire)" onConfirm={async (note) => {
          const done = await freeze(uid.trim(), note);
          if (done) setUid('');
          return done;
        }} />}
        {frozen.map((p) => (
          <div key={p.uid} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900 border border-rose-500/30 text-xs text-slate-200">
            <span>Joueur {shortUid(p.uid)} · gelé par {p.freeze?.by} le {p.freeze ? fmtDate(p.freeze.at) : ''} : {p.freeze?.note}</span>
            <button type="button" onClick={() => void post(`/api/katika/cash/protection-players/${encodeURIComponent(p.uid)}/unfreeze`, {})} className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-bold cursor-pointer">
              Dégeler
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-2 pt-3 border-t border-slate-800">
        <h4 className="text-xs font-bold text-slate-300">Signalements de collusion</h4>
        <p className="text-xs text-slate-500">Un joueur signalé voit ses retraits attendre ta validation, jusqu’à la clôture du signalement.</p>
        {alerts.length === 0 && <p className="text-xs text-slate-500">Aucun signalement ouvert.</p>}
        {alerts.map((a) => (
          <div key={a.id} className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-slate-900 border border-amber-500/30 text-xs text-slate-200">
            <div className="font-bold text-amber-200">{a.label}</div>
            <div>
              {a.uids.map(shortUid).join(' et ')} · {a.parties} parties · écart {Math.abs(a.netToA).toLocaleString('fr-FR')} FCFA · {fmtDate(a.createdAt)}
            </div>
            <div className="flex flex-wrap gap-2">
              {a.uids.map((target) => (
                <NoteAction key={target} label={`Geler ${shortUid(target)}`} placeholder="Motif du gel (obligatoire)" onConfirm={(note) => freeze(target, note)} />
              ))}
              <NoteAction label="Clôturer" placeholder="Ce que tu as constaté (obligatoire)" onConfirm={(note) => post(`/api/katika/cash/collusion-alerts/${encodeURIComponent(a.id)}/close`, { note })} />
            </div>
          </div>
        ))}
      </div>

      {settings && (
        <div className="pt-3 border-t border-slate-800">
          <NumericFields fields={SECURITY_FIELDS} settings={settings} onSave={saveSettings} />
        </div>
      )}
    </div>
  );
};
